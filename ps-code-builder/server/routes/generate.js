/**
 * generate.js
 * POST /generate — multi-unit pipeline implementation.
 *
 * Pipeline:
 *   Step 1: getComponentStructure()
 *   Step 2: getAllRecords()
 *   Step 2.5: Pre-fetch fields for all records → build fieldMetadata
 *             (hasSetId, isEffDated per record; scrollLevel from component structure)
 *   Step 3: decompose requirement (Haiku) → array of technical units
 *   Step 4: For each unit in parallel:
 *             a. classify event (eventClassifier)
 *             b. RAG searches (3 base + unit.additionalRagQueries)
 *             c. getPeopleCodeByEvent (existing code)
 *             d. keyFields from pre-fetched cache
 *   Step 5: For each unit sequentially:
 *             a. contextBuilder.build()
 *             b. codeGenerator.generate() (Sonnet via llmClient)
 *   Step 6: Assemble codeBlocks response
 */

import { randomUUID }              from 'crypto';
import { Router } from 'express';
import * as mcpClient              from '../services/mcpClient.js';
import { search as ragSearch }     from '../services/ragClient.js';
import { classify }                from '../services/eventClassifier.js';
import { build as buildContext }   from '../services/contextBuilder.js';
import { generate }                from '../services/codeGenerator.js';
import { decompose }               from '../services/requirementDecomposer.js';
import { filterRelevantCode }      from '../services/codeContextFilter.js';
import { analyze }                 from '../services/analysisAgent.js';
import { parseCode, buildFallback as parseFallback } from '../services/codeParser.js';
import notifier                   from '../services/notifier.js';

const router = Router();

// ── Propose → Execute context cache ──────────────────────────────────────────
// Stores gathered pipeline data (Steps 1–4) keyed by a one-time contextId so
// the execute call can skip redundant MCP + RAG work when it follows a propose.
const _contextCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of _contextCache) {
    if (now - entry.timestamp > 5 * 60 * 1000) _contextCache.delete(id); // 5-min TTL
  }
}, 60_000).unref?.();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try an async operation; on failure log and return the fallback. */
async function tryOr(fn, fallback, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[generate] Step failed — ${label}:`, err.message);
    return fallback;
  }
}

/** Derive the primary record name from the getAllRecords result. */
function primaryRecord(allRecords) {
  if (!allRecords) return '';

  if (Array.isArray(allRecords)) {
    const first = allRecords[0];
    if (!first) return '';
    return (
      first?.record_name ??
      first?.recordName ??
      first?.name ??
      (typeof first === 'string' ? first : '')
    );
  }

  if (allRecords.records && Array.isArray(allRecords.records)) {
    return primaryRecord(allRecords.records);
  }

  return typeof allRecords === 'string' ? allRecords : '';
}

/** Extract all record names from the getAllRecords result as a flat array. */
function extractRecordNames(allRecords) {
  if (!allRecords) return [];

  const list = Array.isArray(allRecords) ? allRecords
    : Array.isArray(allRecords?.records) ? allRecords.records
    : [];

  return list
    .map((r) => r?.record_name ?? r?.recordName ?? r?.name ?? (typeof r === 'string' ? r : null))
    .filter(Boolean);
}

/**
 * Extract uppercase field names from a getFieldsByRecord result.
 * Handles arrays of field objects and various field name key conventions.
 */
function extractFieldNames(fields) {
  if (!fields) return [];

  const list = Array.isArray(fields) ? fields
    : Array.isArray(fields?.fields) ? fields.fields
    : [];

  return list
    .map((f) => f?.fieldname ?? f?.field_name ?? f?.name ?? (typeof f === 'string' ? f : null))
    .filter(Boolean)
    .map((n) => n.toUpperCase());
}

/**
 * Extract record→scrollLevel map from the component structure response.
 * Tries common key shapes returned by ps-mcp-server.
 */
function extractScrollLevels(componentStructure) {
  if (!componentStructure) return {};

  const map = {};

  const list = Array.isArray(componentStructure) ? componentStructure
    : Array.isArray(componentStructure?.records) ? componentStructure.records
    : Array.isArray(componentStructure?.pages)   ? componentStructure.pages
    : [];

  for (const item of list) {
    const name  = item?.record_name ?? item?.recordName ?? item?.name;
    const level = item?.scroll_level ?? item?.scrollLevel ?? item?.level;
    if (name && level !== undefined) {
      map[name] = Number(level);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Location hierarchy helpers
// ---------------------------------------------------------------------------

const COMPONENT_LEVEL_EVENTS = new Set([
  'PostBuild', 'PreBuild', 'SavePreChange', 'SavePostChange',
  'SaveEdit', 'WorkFlow',
]);

const PAGE_LEVEL_EVENTS = new Set(['Activate', 'Deactivate']);

/** Build the full dotted location path and format string from parsed metadata. */
function buildLocation({ event, record, field, componentName }) {
  if (!event) return { locationFormat: '', location: '', alternativeLocation: '' };

  const hasField  = field && field !== 'N/A';
  const hasRecord = record && record !== 'N/A';

  if (PAGE_LEVEL_EVENTS.has(event)) {
    const page = record || `${componentName}_PAGE`;
    return {
      locationFormat: 'PAGE.Event',
      location: `${page}.${event}`,
      alternativeLocation: '',
    };
  }

  if (COMPONENT_LEVEL_EVENTS.has(event) && !hasField) {
    const comp = componentName || record;
    const alt  = hasRecord ? `${record}.${event}` : '';
    return {
      locationFormat: 'COMPONENT.Event',
      location: `${comp}.${event}`,
      alternativeLocation: alt !== `${comp}.${event}` ? alt : '',
    };
  }

  if (hasField && hasRecord) {
    const alt = COMPONENT_LEVEL_EVENTS.has(event)
      ? `${componentName}.${event}`
      : '';
    return {
      locationFormat: 'RECORD.FIELD.Event',
      location: `${record}.${field}.${event}`,
      alternativeLocation: alt,
    };
  }

  if (hasRecord) {
    const alt = COMPONENT_LEVEL_EVENTS.has(event)
      ? `${componentName}.${event}`
      : '';
    return {
      locationFormat: 'RECORD.Event',
      location: `${record}.${event}`,
      alternativeLocation: alt,
    };
  }

  return { locationFormat: '', location: '', alternativeLocation: '' };
}

/** Extract RAG source titles/ids from a results array. */
function ragTitles(results) {
  if (!Array.isArray(results)) return [];
  return results
    .map((r) => r?.metadata?.title ?? r?.id ?? r?.source ?? null)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Paste mode helpers
// ---------------------------------------------------------------------------

const FIELD_LEVEL_EVENTS = new Set([
  'FieldEdit', 'FieldChange', 'FieldDefault', 'FieldFormula',
]);

/**
 * Build a synthetic existingCode object from a raw pasted code string.
 * Structures it the same way ps-mcp-server returns getPeopleCodeByEvent,
 * so contextBuilder.formatExistingCode() can render it without changes.
 *
 * @param {string} pastedCode
 * @param {string} eventHint
 * @param {object} parsedContext
 * @returns {object}
 */
function buildSyntheticExistingCode(pastedCode, eventHint, parsedContext) {
  const event = { field_name: parsedContext.primaryRecord, event_name: eventHint, code: pastedCode };
  return {
    record:        parsedContext.primaryRecord,
    source:        'paste',
    field_events:  FIELD_LEVEL_EVENTS.has(eventHint) ? [event] : [],
    record_events: FIELD_LEVEL_EVENTS.has(eventHint) ? [] : [event],
  };
}

/**
 * Build a synthetic keyFields object from extracted field names.
 * Used in paste mode when MCP is not available.
 *
 * @param {object} parsedContext
 * @returns {object}
 */
function buildSyntheticKeyFields(parsedContext) {
  return {
    record: parsedContext.primaryRecord,
    source: 'paste',
    fields: (parsedContext.fields || []).map((name) => ({
      field_name:  name,
      field_label: name,
      data_type:   'Unknown',
      is_key:      false,
    })),
  };
}

// ---------------------------------------------------------------------------
// POST /parse — extract metadata from pasted code (confirmation step)
// ---------------------------------------------------------------------------

router.post('/parse', async (req, res) => {
  const { pastedCode, requirement } = req.body ?? {};

  if (!pastedCode || !requirement) {
    return res.status(400).json({
      success: false,
      error:   'pastedCode and requirement are required',
    });
  }

  const parsedContext = await tryOr(
    () => parseCode(pastedCode, requirement),
    parseFallback(),
    'parseCode'
  );

  return res.json({ success: true, parsedContext });
});

// ---------------------------------------------------------------------------
// Paste mode handler — called from POST /generate when action starts with 'paste'
// ---------------------------------------------------------------------------

async function handlePasteMode(req, res, { action, componentName, requirement, steps }) {
  const log = (msg) => { steps.push(msg); console.log(`[Sparky:paste] ${msg}`); };

  const { pastedCode, eventHint, parsedContext: clientContext } = req.body ?? {};

  if (!pastedCode || !eventHint || !requirement) {
    return res.status(400).json({
      success: false,
      error:   'pastedCode, eventHint, and requirement are required for paste mode',
    });
  }

  // Use client-provided context from prior /parse call, or re-parse now
  const parsedContext = (clientContext?.primaryRecord && clientContext.primaryRecord !== 'UNKNOWN')
    ? clientContext
    : await tryOr(() => parseCode(pastedCode, requirement), parseFallback(), 'parseCode');

  log(`Paste mode: primary record=${parsedContext.primaryRecord}, event=${eventHint}, fields=${parsedContext.fields.length}`);

  // Build synthetic objects that match the shape contextBuilder expects
  const existingCode = buildSyntheticExistingCode(pastedCode, eventHint, parsedContext);
  const keyFields    = buildSyntheticKeyFields(parsedContext);

  // RAG — same classify + search logic as normal mode
  notifier.trace('Searching documentation for relevant PeopleCode patterns...');
  const { event: classifiedEvent, confidence, ragQueries } = classify(requirement);

  const additionalRagQueries = [
    ...(parsedContext.hasSetId    ? ['GetSetId SetID resolution PeopleCode'] : []),
    ...(parsedContext.isEffDated  ? ['%EffDtCheck effective date SQL PeopleCode'] : []),
    ...(parsedContext.scrollLevel > 0 ? ['ActiveRowCount GetRow scroll loop PeopleCode'] : []),
    'MsgGetText message catalog error PeopleCode',
  ];

  const allQueries = [...ragQueries, ...additionalRagQueries];
  const allRagResults = await Promise.all(
    allQueries.map((q) => tryOr(() => ragSearch(q), [], `ragSearch("${q}")`))
  );
  const [eventDocs = [], functionDocs = [], classDocs = []] = allRagResults;
  const mergedClassDocs = [
    ...(Array.isArray(classDocs) ? classDocs : []),
    ...allRagResults.slice(3).flat(),
  ];

  log('RAG search complete');

  // ── paste-propose: return analysis only ────────────────────────────────────
  if (action === 'paste-propose') {
    notifier.trace('Analyst: Reviewing existing code and mapping requirement...');
    log('Generating paste-mode technical proposal');

    const proposal = await tryOr(
      () => analyze(requirement, {
        componentStructure: { component_name: componentName || parsedContext.primaryRecord },
        unitsContext: [{
          targetRecord: parsedContext.primaryRecord,
          targetField:  null,
          event:        eventHint,
          existingCode,
          keyFields,
        }],
      }),
      '(Analysis unavailable)',
      'analyze'
    );

    return res.json({
      success:         true,
      phase:           'proposal',
      proposal,
      parsedContext,
      processingSteps: steps,
    });
  }

  // ── paste-execute: full code generation ────────────────────────────────────
  notifier.trace(`Generator: Merging requirement into ${parsedContext.primaryRecord}.${eventHint}...`);
  log(`Generating code for ${parsedContext.primaryRecord}.${eventHint}`);

  const prompt = await buildContext({
    componentStructure: {
      component_name: componentName || parsedContext.primaryRecord,
      scroll_levels:  [{ table_name: parsedContext.primaryRecord, scroll_level: parsedContext.scrollLevel }],
    },
    allRecords:   null,
    keyFields,
    existingCode,
    targetField:  null,
    targetEvent:  eventHint || null,
    eventDocs,
    functionDocs,
    classDocs:    mergedClassDocs,
    requirement,
    parsedContext,
  });

  const {
    generatedCode,
    suggestedEvent,
    suggestedRecord,
    suggestedField,
    locationFormat,
    location,
    alternativeLocation,
    suggestedPage,
    explanation,
    sources,
  } = await tryOr(
    () => generate(prompt),
    {
      generatedCode:       '/* Code generation failed */',
      suggestedEvent:      eventHint,
      suggestedRecord:     parsedContext.primaryRecord,
      suggestedField:      '',
      locationFormat:      '',
      location:            `${parsedContext.primaryRecord}.${eventHint}`,
      alternativeLocation: '',
      suggestedPage:       '',
      explanation:         '',
      sources:             [],
    },
    'generate'
  );

  log('Paste mode generation complete');

  return res.json({
    success:          true,
    requirementUnits: 1,
    codeBlocks: [{
      unitRequirement:     requirement,
      suggestedEvent:      suggestedEvent  || eventHint,
      suggestedRecord:     suggestedRecord || parsedContext.primaryRecord,
      suggestedField:      suggestedField  || '',
      confidence,
      locationFormat:      locationFormat  || 'RECORD.Event',
      location:            location        || `${parsedContext.primaryRecord}.${eventHint}`,
      alternativeLocation: alternativeLocation || '',
      suggestedPage:       suggestedPage   || '',
      generatedCode,
      explanation,
    }],
    ragSources:      sources,
    parsedContext,
    processingSteps: steps,
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

router.post('/generate', async (req, res) => {
  const { componentName, market = 'GBL', requirement, action = 'execute', proposal = null, contextId = null } = req.body ?? {};

  const steps = [];
  const log   = (msg) => { steps.push(msg); console.log(`[Sparky] ${msg}`); };

  // Paste mode — no MCP, uses pasted code as context source
  if (action === 'paste-propose' || action === 'paste-execute') {
    return handlePasteMode(req, res, { action, componentName, requirement, steps });
  }

  if (!componentName || !requirement) {
    return res.status(400).json({
      success: false,
      error: 'componentName and requirement are required',
    });
  }

  try {
    let componentStructure, allRecords, unitData;

    if (contextId && _contextCache.has(contextId)) {
      // ── Cache hit — reuse propose context, skip Steps 1–4 ─────────────────
      const cached = _contextCache.get(contextId);
      _contextCache.delete(contextId); // one-time use
      log('Cache hit — reusing propose context, skipping MCP/RAG harvest');
      ({ componentStructure, allRecords, unitData } = cached);
    } else {
      // ── Steps 1–4: Full pipeline ───────────────────────────────────────────

      // ── Step 1: Component structure ─────────────────────────────────────
      notifier.trace(`Scanning component structure for ${componentName}...`);
      log('Fetching component structure');
      componentStructure = await tryOr(
        () => mcpClient.getComponentStructure(componentName, market),
        null,
        'getComponentStructure'
      );

      // ── Step 2: All records ─────────────────────────────────────────────
      notifier.trace('Harvesting record metadata and scroll levels...');
      log('Fetching all records');
      allRecords = await tryOr(
        () => mcpClient.getAllRecords(componentName),
        null,
        'getAllRecords'
      );

      const primRecord   = primaryRecord(allRecords);
      const recordNames  = extractRecordNames(allRecords);
      const scrollLevels = extractScrollLevels(componentStructure);

      // ── Step 2.5: Build Minimal Field Metadata for Triage ───────────────
      // We only provide a summary map (no field lists) to the Decomposer
      // initially to keep the prompt size under the 30k token limit.
      const triageFieldMetadata = {
        byRecord: Object.fromEntries(
          recordNames.map((name) => [name, {
            scrollLevel: scrollLevels[name] ?? 0,
          }])
        ),
      };

      // ── Step 3: Decompose requirement into units (Haiku) ────────────────
      notifier.trace('Triage: Decomposing requirement into technical units...');
      log('Decomposing requirement into technical units');
      const units = await tryOr(
        () => decompose(requirement, componentName, allRecords, triageFieldMetadata),
        [{
          requirement,
          record:               primRecord || 'UNKNOWN',
          field:                null,
          eventHint:            'FieldEdit',
          level:                'field',
          executionOrder:       1,
          additionalRagQueries: ['MsgGetText message catalog error PeopleCode'],
        }],
        'decompose'
      );
      log(`Decomposed into ${units.length} unit(s): ${units.map((u) => u.record).join(', ')}`);

      // ── Step 4: Surgical Metadata Harvesting ────────────────────────────
      // Only fetch fields for records Haiku actually identified.
      // primRecord is the fallback only when every unit returned UNKNOWN.
      const haikuTargets    = [...new Set(units.map(u => u.record))].filter(r => r && r !== 'UNKNOWN');
      const targetedRecords = haikuTargets.length > 0 ? haikuTargets : [primRecord].filter(Boolean);

      log(`Surgically harvesting field metadata for ${targetedRecords.length} record(s)`);
      const allFieldsMap = Object.fromEntries(
        await Promise.all(
          targetedRecords.map(async (name) => {
            const fields = await tryOr(
              () => mcpClient.getFieldsByRecord(name),
              null,
              `getFieldsByRecord(${name}) [surgical]`
            );
            return [name, fields];
          })
        )
      );

      // Build the final deep metadata object for the Analyst/Generator
      const deepFieldMetadata = {
        byRecord: Object.fromEntries(
          targetedRecords.map((name) => {
            const fields     = allFieldsMap[name];
            const fieldNames = extractFieldNames(fields);
            return [name, {
              hasSetId:    fieldNames.includes('SETID'),
              isEffDated:  fieldNames.includes('EFFDT'),
              scrollLevel: scrollLevels[name] ?? 0,
              fields:      fieldNames,
            }];
          })
        ),
      };

      // ── Step 4: Per-unit data gathering (parallel across units) ─────────
      notifier.trace(`Gathering context for ${units.length} unit(s) in parallel...`);
      log(`Gathering context for ${units.length} unit(s) in parallel`);
      unitData = await Promise.all(
        units.map(async (unit) => {
          // 4a. Classify the unit's specific sub-requirement
          const { event, confidence, ragQueries } = classify(unit.requirement);
          const resolvedEvent = unit.eventHint || event;

          // 4b. RAG searches — 3 base queries + additionalRagQueries, all in parallel
          const extraQueries = Array.isArray(unit.additionalRagQueries)
            ? unit.additionalRagQueries
            : [];
          const allQueries = [...ragQueries, ...extraQueries];

          const allRagResults = await Promise.all(
            allQueries.map((q) => tryOr(() => ragSearch(q), [], `ragSearch("${q}")`))
          );

          const [eventDocs = [], functionDocs = [], classDocs = []] = allRagResults;
          // Merge any additional query results into classDocs for the context builder
          const additionalDocs  = allRagResults.slice(3).flat();
          const mergedClassDocs = [
            ...(Array.isArray(classDocs) ? classDocs : []),
            ...additionalDocs,
          ];

          // 4c. Existing PeopleCode — fetch ALL events for the target record from PSPCMTXT.
          // Passes field_name so the tool runs two targeted DB queries:
          //   SQL6a: events directly on the target field (FieldEdit, FieldChange etc.)
          //   SQL6b: all events on the record (SavePreChange, SaveEdit, RowInit etc.)
          const targetRecord = (unit.record && unit.record !== 'UNKNOWN')
            ? unit.record
            : primRecord;

          const existingCode = targetRecord
            ? await tryOr(
                () => mcpClient.getPeopleCodeByEvent(targetRecord, unit.field || ''),
                null,
                `getPeopleCodeByEvent(${targetRecord})`
              )
            : null;

          const fieldEventCount  = existingCode?.field_events?.length  ?? 0;
          const recordEventCount = existingCode?.record_events?.length ?? 0;
          log(`Existing PeopleCode on ${targetRecord}: ${fieldEventCount} field event(s), ${recordEventCount} record event(s) — running relevance filter...`);

          // 4c.5 Relevance filter — Haiku scans event blocks to prevent prompt inflation.
          // INTEGRATION FIX: We MUST exempt the specific target event from this filter
          // to ensure the generator has the complete original source for the merge.
          const filteredCode = await tryOr(
            async () => {
              if (!existingCode) return null;

              // Perform relevance filtering on all events
              const result = await filterRelevantCode(existingCode, unit.requirement);

              // ENSURE the specific target event is included even if Haiku says "NO"
              const targetEvents = (existingCode.field_events || []).filter(
                e => e.event_name === resolvedEvent && e.field_name === unit.field
              );
              const targetRecEvents = (existingCode.record_events || []).filter(
                e => e.event_name === resolvedEvent && !unit.field
              );

              // Re-inject the target events if they were filtered out
              targetEvents.forEach(te => {
                if (!result.field_events.find(f => f.event_name === te.event_name && f.field_name === te.field_name)) {
                  result.field_events.push(te);
                }
              });
              targetRecEvents.forEach(te => {
                if (!result.record_events.find(r => r.event_name === te.event_name)) {
                  result.record_events.push(te);
                }
              });

              return result;
            },
            existingCode,
            `filterRelevantCode(${targetRecord})`
          );

          // 4d. Key fields — use pre-fetched cache; only call MCP if not already fetched
          const keyFields = targetRecord
            ? (allFieldsMap[targetRecord] !== undefined
                ? allFieldsMap[targetRecord]
                : await tryOr(
                    () => mcpClient.getFieldsByRecord(targetRecord),
                    null,
                    `getFieldsByRecord(${targetRecord})`
                  ))
            : null;

          return {
            unit,
            event:        resolvedEvent,
            confidence,
            ragQueries,
            extraQueries,
            eventDocs,
            functionDocs,
            classDocs:    mergedClassDocs,
            existingCode: filteredCode, // filtered by Haiku — only relevant events
            keyFields,
            targetRecord,
          };
        })
      );
      log('Context gathering complete');
    } // end Steps 1–4

    // ── Step 4.5: Analysis Phase (Optional) ─────────────────────────────────
    if (action === 'propose') {
      notifier.trace('Analyst: Commencing surgical audit and technical proposal...');
      log('Generating technical proposal');
      const proposalText = await analyze(requirement, {
        componentStructure,
        unitsContext: unitData.map(d => ({
          targetRecord: d.targetRecord,
          targetField:  d.unit.field,
          event:        d.event,
          existingCode: d.existingCode,
          keyFields:    d.keyFields,
        })),
      });

      // Cache the gathered context so execute can skip Steps 1–4
      const newContextId = randomUUID();
      _contextCache.set(newContextId, {
        timestamp: Date.now(),
        componentStructure,
        allRecords,
        unitData,
      });

      return res.json({
        success:         true,
        phase:           'proposal',
        proposal:        proposalText,
        contextId:       newContextId,
        processingSteps: steps,
      });
    }

    // ── Step 5: Sequential code generation per unit ─────────────────────────
    const codeBlocks   = [];
    const allRagSources = [];

    // Accumulator: tracks the latest generated code per event location so that
    // non-consecutive units targeting the same event (e.g. SaveEdit, RowInit,
    // SaveEdit) each receive the prior merged output as their existingCode.
    // Key: `${record}::${event}::${field||''}` — uniquely identifies one event block.
    const generatedByLocation = new Map();

    for (let idx = 0; idx < unitData.length; idx++) {
      const data = unitData[idx];

      // If a prior unit already generated code for this exact event location,
      // substitute it as existingCode so this unit builds on top of it.
      const locationKey = `${data.targetRecord}::${data.event}::${data.unit.field || ''}`;
      if (generatedByLocation.has(locationKey)) {
        const priorCode   = generatedByLocation.get(locationKey);
        const isFieldEvt  = FIELD_LEVEL_EVENTS.has(data.event);
        data.existingCode = {
          record:        data.targetRecord,
          source:        'chained',
          field_events:  isFieldEvt
            ? [{ field_name: data.unit.field, event_name: data.event, code: priorCode }]
            : [],
          record_events: isFieldEvt
            ? []
            : [{ field_name: data.targetRecord, event_name: data.event, code: priorCode }],
        };
        log(`Unit ${idx + 1}: chaining prior output for ${data.targetRecord}.${data.event} (location key: ${locationKey})`);
      }

      const { unit, event, confidence, eventDocs, functionDocs, classDocs, existingCode, keyFields } = data;

      log(`Generating code for unit ${data.unit.executionOrder}: ${unit.requirement.slice(0, 60)}…`);

      // 5a. Build context prompt for this unit
      const prompt = await buildContext({
        componentStructure,
        allRecords,
        keyFields,
        existingCode,
        targetField:  unit.field || null,
        targetEvent:  event || null,
        eventDocs,
        functionDocs,
        classDocs,
        requirement: unit.requirement,
        proposal,
      });

      // 5b. Generate code (Sonnet via llmClient)
      notifier.trace(`Generator: Merging logic into ${unit.record}.${unit.field || '(rec)'}.${event}...`);
      const {
        generatedCode,
        suggestedEvent:      parsedEvent,
        suggestedRecord:     parsedRecord,
        suggestedField:      parsedField,
        locationFormat:      parsedLocationFormat,
        location:            parsedLocation,
        alternativeLocation: parsedAltLocation,
        suggestedPage:       parsedPage,
        explanation,
        sources,
      } = await tryOr(
        () => generate(prompt),
        {
          generatedCode: '/* Code generation failed for this unit */',
          suggestedEvent: event,
          suggestedRecord: data.targetRecord,
          suggestedField: unit.field || '',
          locationFormat: '', location: '', alternativeLocation: '',
          suggestedPage: '', explanation: '', sources: [],
        },
        `generate(unit ${unit.executionOrder})`
      );

      // ── Update accumulator so later units at the same location chain forward ──
      const generationSucceeded = generatedCode && !generatedCode.startsWith('/* Code generation failed');
      if (generationSucceeded) {
        generatedByLocation.set(locationKey, generatedCode);
      }

      // Resolve final metadata — prefer model output, fall back to known values
      const finalEvent  = parsedEvent  || event;
      const finalRecord = parsedRecord || data.targetRecord;
      const finalField  = parsedField  || unit.field || '';

      const fallback = buildLocation({
        event: finalEvent, record: finalRecord,
        field: finalField, componentName,
      });

      const finalLocationFormat = parsedLocationFormat || fallback.locationFormat;
      const finalLocation       = parsedLocation       || fallback.location;
      const finalAltLocation    = parsedAltLocation    || fallback.alternativeLocation;
      const finalPage           = parsedPage           || '';

      if (finalLocation) log(`Unit ${unit.executionOrder} location: ${finalLocation}`);

      // Accumulate RAG sources
      const unitSources = [
        ...ragTitles(eventDocs),
        ...ragTitles(functionDocs),
        ...ragTitles(classDocs),
        ...(ragTitles(eventDocs).length    === 0 ? [data.ragQueries[0]] : []),
        ...(ragTitles(functionDocs).length === 0 ? [data.ragQueries[1]] : []),
        ...(ragTitles(classDocs).length    === 0 ? [data.ragQueries[2]] : []),
        ...sources,
      ].filter(Boolean);

      allRagSources.push(...unitSources);

      codeBlocks.push({
        unitRequirement:     unit.requirement,
        suggestedEvent:      finalEvent,
        suggestedRecord:     finalRecord,
        suggestedField:      finalField,
        confidence,
        locationFormat:      finalLocationFormat,
        location:            finalLocation,
        alternativeLocation: finalAltLocation,
        suggestedPage:       finalPage,
        generatedCode,
        explanation,
      });
    }

    log('All units generated');

    const ragSources = allRagSources.filter((v, i, arr) => v && arr.indexOf(v) === i);

    // ── Step 6: Assemble response ────────────────────────────────────────────
    return res.json({
      success:          true,
      requirementUnits: codeBlocks.length,
      codeBlocks,
      ragSources,
      processingSteps:  steps,
    });

  } catch (err) {
    console.error('[Sparky] Unhandled pipeline error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      processingSteps: steps,
    });
  }
});

export default router;
