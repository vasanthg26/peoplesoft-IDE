/**
 * contextBuilder.js
 * Assembles the compact LLM prompt from metadata, existing code, RAG results, and coding rules.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODING_STYLE_PATH = join(__dirname, '../../knowledge/coding_style.md');

// Cache the style guide in memory after first read
let _codingStyleCache = null;

/**
 * Read coding_style.md once and cache the result.
 * @returns {Promise<string>}
 */
async function loadCodingStyle() {
  if (_codingStyleCache !== null) return _codingStyleCache;
  try {
    _codingStyleCache = await readFile(CODING_STYLE_PATH, 'utf8');
  } catch (err) {
    console.error('[contextBuilder] Could not read coding_style.md:', err.message);
    _codingStyleCache = '(Coding style guide unavailable)';
  }
  return _codingStyleCache;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function stringify(value) {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'string') return value.trim() || '(none)';
  return JSON.stringify(value, null, 2);
}

/** Compact scroll level list — just level number and record name. */
function formatScrollLevels(componentStructure) {
  const levels = componentStructure?.scroll_levels || componentStructure?.records || [];
  if (!Array.isArray(levels) || levels.length === 0) return '(none)';
  return levels.map((l) => {
    const name = l.table_name || l.record_name || l.name;
    const lvl  = l.scroll_level ?? l.scrollLevel ?? l.level;
    return `  L${lvl}: ${name}`;
  }).join('\n');
}

/** Decode PeopleSoft numeric field_type to human-readable type name. */
const FIELD_TYPE_NAMES = {
  0: 'Char', 1: 'Long Char', 2: 'Number', 3: 'Signed Number',
  4: 'Date', 5: 'Time', 6: 'DateTime', 8: 'Image/Attachment',
};

/** Compact field list — field_name, type, and label only. Minimises tokens. */
function formatKeyFields(keyFields) {
  const fields = keyFields?.fields ?? (Array.isArray(keyFields) ? keyFields : null);
  if (!fields || fields.length === 0) return '(none)';
  return fields
    .map((f) => {
      const name  = f.field_name  || f.FIELDNAME || '';
      const label = f.field_label || f.FIELD_LABEL || name;
      const rawType = f.field_type ?? f.data_type ?? f.type;
      const type  = (typeof rawType === 'number') ? (FIELD_TYPE_NAMES[rawType] || 'Unknown') : (rawType || 'String');
      const key   = f.is_key      ? ' [KEY]' : '';
      const xlat  = f.is_list_box ? ' [XLAT]' : '';
      return `  ${name} (${type})${key}${xlat} — ${label}`;
    })
    .join('\n');
}

/** Format translate values for injection into the prompt context. */
function formatTranslateValues(translateValues) {
  if (!translateValues || !Array.isArray(translateValues) || translateValues.length === 0) {
    return '';
  }

  return translateValues
    .map(({ fieldName, values }) => {
      if (!values || !Array.isArray(values) || values.length === 0) return null;
      const valLines = values
        .map((v) => `    "${v.field_value}" = ${v.long_name}`)
        .join('\n');
      return `  ${fieldName}:\n${valLines}`;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Format existing PeopleCode — two sections: field-level events and record-wide events.
 * record_events filtered to save/init events only to keep token count manageable.
 */
function formatExistingCode(existingCode, targetField) {
  if (!existingCode) return '(none found — fresh code)';

  const MAX_CODE_CHARS = 100000; // Increased to support full file ingestion for surgical integration

  const fieldEvents  = existingCode.field_events  || existingCode.peoplecode || [];
  const recordEvents = (existingCode.record_events || []).filter((e) =>
    ['SavePreChange', 'SaveEdit', 'SavePostChange', 'RowInit', 'PreBuild', 'PostBuild', 'Activate']
      .includes(e.event_name)
  );

  const header = targetField
    ? `Target field: ${existingCode.record || ''}.${targetField}`
    : `Record: ${existingCode.record || ''}`;

  const fmt = (events) => {
    if (!events.length) return '  (none)';
    return events.map((e) => {
      const raw  = e.code || '';
      const code = raw.length > MAX_CODE_CHARS
        ? raw.slice(0, MAX_CODE_CHARS) + '\n  /* ... truncated ... */'
        : raw;
      return `  [${e.field_name}.${e.event_name}]\n${code}`;
    }).join('\n\n');
  };

  return `${header}

### A. Events directly on target field (${targetField || 'all'})
${fmt(fieldEvents)}

### B. Save/Init events on this record (review before making changes)
${fmt(recordEvents)}`;
}

/** Format RAG results into a readable block — capped at top 2, 600 chars each. */
function formatRagResults(results) {
  if (!Array.isArray(results) || results.length === 0) return '(no results)';
  const MAX_CHARS = 600;
  return results
    .slice(0, 2)
    .map((r, i) => {
      if (typeof r === 'string') return `[${i + 1}] ${r.slice(0, MAX_CHARS)}`;
      const title   = r?.metadata?.title ?? r?.id ?? `Result ${i + 1}`;
      const content = (r?.content ?? r?.text ?? stringify(r)).slice(0, MAX_CHARS);
      return `[${i + 1}] ${title}\n${content}`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Paste-mode metadata formatter
// ---------------------------------------------------------------------------

/**
 * Render the [BLOCK:METADATA] section from codeParser output instead of MCP data.
 * Used when action is paste or paste-execute.
 *
 * @param {object} parsedContext - Output of codeParser.parseCode()
 * @returns {string}
 */
function formatPasteMetadata(parsedContext) {
  const { primaryRecord, records, fields, variables, scrollLevel, summary } = parsedContext;

  const otherRecords = (records || []).filter((r) => r !== primaryRecord);
  const scrollLine   = `  L${scrollLevel}: ${primaryRecord}${otherRecords.length ? `\n  Additional: ${otherRecords.join(', ')}` : ''}`;

  const varLines = (variables || []).length > 0
    ? variables.map((v) => `  ${v.name}: ${v.type}${v.record ? ` → ${v.record}` : ''}`).join('\n')
    : '  (none declared)';

  const fieldLines = (fields || []).length > 0
    ? `  ${fields.join(', ')}`
    : '  (none extracted)';

  return `# MODE: Paste Mode — metadata extracted from pasted code, no MCP available
# CODE SUMMARY: ${summary || '(not available)'}

# INFERRED SCROLL STRUCTURE:
${scrollLine}

# VARIABLE INVENTORY (extracted from pasted code):
# CRITICAL: You MUST reuse these exact variable names. Do NOT redeclare them.
${varLines}

# FIELDS REFERENCED IN PASTED CODE:
# Use ONLY these field names. For new fields introduced by the requirement, follow PeopleSoft naming conventions and use RAG documentation for type guidance.
${fieldLines}`;
}

// ---------------------------------------------------------------------------
// build()
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BuildContext
 * @property {unknown}  componentStructure  - From ps-mcp-server
 * @property {unknown}  allRecords          - From ps-mcp-server (not passed to Sonnet — used by Haiku)
 * @property {unknown}  keyFields           - From ps-mcp-server
 * @property {unknown}  existingCode        - From ps-mcp-server (dual-section: field_events + record_events)
 * @property {string}   [targetField]       - The specific field being targeted
 * @property {string}   [targetEvent]       - The PeopleCode event being generated (e.g. SaveEdit, FieldChange)
 * @property {Array}    eventDocs           - RAG results (event classification query)
 * @property {Array}    functionDocs        - RAG results (function syntax query)
 * @property {Array}    classDocs           - RAG results (class/method query)
 * @property {string}   requirement         - Developer's NL input
 * @property {string}   [proposal]          - Analyst's approved technical proposal markdown (from propose phase)
 * @property {object}   [parsedContext]     - Paste mode: output of codeParser.parseCode()
 * @property {Array}    [translateValues]   - Translate (XLAT) values for list box fields
 */

/**
 * Assemble the compact prompt string to send to Claude Sonnet.
 *
 * @param {BuildContext} context
 * @returns {Promise<string>}
 */
async function build({
  componentStructure,
  allRecords, // kept in signature for compatibility but not included in prompt
  keyFields,
  existingCode,
  targetField,
  targetEvent = null, // which PeopleCode event is being generated (SaveEdit, FieldChange, etc.)
  eventDocs,
  functionDocs,
  classDocs,   // kept in signature for compatibility
  requirement,
  proposal = null, // analyst's approved proposal — field resolutions from the propose phase
  parsedContext = null, // paste mode: replaces MCP-derived metadata block
  translateValues = null, // XLAT values for dropdown/radio fields
}) {
  const metadataBlock = parsedContext
    ? formatPasteMetadata(parsedContext)
    : `# COMPONENT: ${componentStructure?.component_name ?? 'UNKNOWN'}
# TARGET EVENT: ${targetEvent ?? '(infer from existing code)'}
# SCROLL LEVELS:
${formatScrollLevels(componentStructure)}

# RECORD FIELDS (Target: ${existingCode?.record || 'UNKNOWN'}):
${formatKeyFields(keyFields)}${translateValues && translateValues.length > 0 ? `

# TRANSLATE VALUES (dropdown/radio options for [XLAT] fields):
${formatTranslateValues(translateValues)}` : ''}`;

  const prompt = `### [BLOCK:METADATA]
${metadataBlock}

### [BLOCK:DYNAMIC_CONTEXT]
# EXISTING CODE:
${formatExistingCode(existingCode, targetField)}

# RAG DOCUMENTATION:
${formatRagResults(eventDocs)}
${formatRagResults(functionDocs)}

### [BLOCK:PROPOSAL]
# APPROVED TECHNICAL PROPOSAL (from analysis phase — treat field names here as authoritative):
${proposal ?? '(no prior analysis — infer field names from RECORD FIELDS and EXISTING CODE above)'}

### [BLOCK:REQUIREMENT]
# STRICT CODE RULES (read before writing ANY code):
- FIELD NAMES: ONLY use field names that appear in "RECORD FIELDS" above. NEVER invent or guess field names.
- ANTI-GRAVITY UI RULE: **FORBIDDEN** to use 'SetCursorPos' or '%Component' if the error is on the current field/row. PeopleSoft handles this natively. 
- UI LOGIC: Use &fld = GetField(Record.X, Field.Y); &fld.Enabled = False; — always with Else branch to re-enable to avoid state bleed.
- DO NOT wrap UI (RowInit) logic in IsChanged or IsNew checks.

# REQUIREMENT:
${requirement?.trim() ?? '(no requirement provided)'}

## INTEGRATION INSTRUCTIONS (FINAL REMINDER):
IF "EXISTING CODE" was provided in Block 3 for the target event:
1. You are acting as a **Full-File Replacement Engine**.
2. ADOPT ALL existing variables (e.g. &LINE, &SCHED). NEVER redeclare them.
3. MERGE Local declarations into the existing "Local" block at the TOP of the code.
4. **NEVER DELETE**: Do not remove any existing code. If a requirement contradicts existing logic, **COMMENT OUT** the old code and explain why.
5. **ADDITIVE BY DEFAULT**: If no contradiction exists, simply integrate the new logic at the correct hook point.
6. **MANDATORY**: Your code block MUST contain the 100% complete source code of the event. Snippets are a failure.
7. If the existing code already has a %Component or Evaluate block, place your logic INSIDE it where appropriate rather than creating a duplicate block.
`;

  return prompt;
}

export { build, loadCodingStyle };
