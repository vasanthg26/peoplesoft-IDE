/**
 * prompts/decompose.js
 * System and user prompt builders for the requirement decomposition task.
 * This task uses a fast/cheap model (Haiku by default) to split a compound
 * business requirement into discrete technical units before code generation.
 */

/**
 * System prompt — instructs the model to act as a strict JSON-only decomposer.
 * No explanations, no markdown, no code fences — just the raw JSON array.
 */
const SYSTEM_PROMPT = `You are a PeopleSoft architect assistant.
Your ONLY job is to decompose business requirements into discrete technical units.
Rules:
- Return ONLY valid JSON array
- No explanations, no markdown, no code blocks
- Just the raw JSON array
- UI operations (gray, hide, enable, disable, visible, read-only, protect) MUST use eventHint: "RowInit"
- Data validations (validate, check, prevent save, error on save) MUST use eventHint: "SaveEdit" or "FieldEdit"
- Data manipulation on save (calculate, derive, set value before write) MUST use eventHint: "SavePreChange"
- CRITICAL: SaveEdit = validation with Error/Warning. SavePreChange = data manipulation, NO Error/Warning allowed.
- Button click handlers or field-driven updates MUST use eventHint: "FieldChange"
- Page-level security or page-specific initialization MUST use eventHint: "Activate"
- Hiding/showing entire pages MUST use eventHint: "PreBuild"
- Component-wide initialization after load MUST use eventHint: "PostBuild"
- Search page defaults, restricting search results, pre-populating search keys MUST use eventHint: "SearchInit"
- An Application Class is NOT an event — it is OOP logic invoked FROM an event. If the requirement mentions a "class", "method", "application package", or reusable OOP logic, still pick the host event (FieldChange, SaveEdit, etc.) that will instantiate the class, and add an Application Class RAG query (see DECOMPOSE rules).
- Record selection: if user says "PO Line", prefer records starting with PO_LINE. If user says "PO Header", prefer PO_HDR. Match by semantic meaning, not alphabetical order.`;

/**
 * Build the user message asking the model to decompose a requirement.
 *
 * Each unit in the returned array represents one targetable piece of code
 * (one record + field + event combination).
 *
 * @param {string}  requirement    - The full business requirement text
 * @param {string}  componentName  - The PeopleSoft component being worked on
 * @param {unknown} records        - Available records (array of objects or strings)
 * @param {{ byRecord: Record<string, { hasSetId: boolean, isEffDated: boolean, scrollLevel: number }> }} [fieldMetadata]
 * @returns {string}
 */
function buildUserPrompt(requirement, componentName, records, fieldMetadata) {
  const recordList = recordsToList(records);
  const metaSection = buildFieldMetaSection(fieldMetadata);

  return `Component: ${componentName}
Available records: ${recordList}
${metaSection}
Business requirement:
${requirement}

Decompose this requirement into discrete technical implementation units. Each unit should target exactly one record, one field (if applicable), and one PeopleCode event.

Return a JSON array where each element has this shape:
[
  {
    "requirement": "specific validation or logic description for this unit only",
    "record": "RECORD_NAME",
    "field": "FIELD_NAME or null if record/component-level",
    "eventHint": "FieldEdit|FieldChange|SaveEdit|SavePreChange|RowInit|Activate|PreBuild|PostBuild|SearchInit",
    "level": "field|record|component",
    "executionOrder": 1,
    "hasSetId": false,
    "isEffDated": false,
    "scrollLevel": 0,
    "requiresLoop": false,
    "additionalRagQueries": []
  }
]

Rules:
- If the full requirement is a single atomic unit, return an array with one element
- Assign executionOrder starting from 1, in the order the units should logically execute
- **CRITICAL**: Use ONLY record names from the Available records list above.
- **RECORD PRIORITY**: You are FORBIDDEN from selecting staging, derived, or temporary records (names ending in _FS, _STG, _WRK, _VW) if a core transactional record is available. Mapping to a "_WRK" record when the user says "PO Line" is a critical architectural failure. ALWAYS prefer the most physically "heavy" table (e.g., prefer PO_LINE_SHIP over PO_SCHED_WRK).
- **UI EVENT RULE**: If the requirement is about graying, hiding, enabling, disabling or changing visibility of a field, ALWAYS set eventHint to "RowInit". NEVER use FieldEdit or SaveEdit for UI appearance changes.
- **DATA VALIDATION RULE**: If the requirement is a validation or data integrity check that should stop the save, use "SaveEdit" (cross-field/cross-row) or "FieldEdit" (single-field, on field exit). SaveEdit allows Error/Warning to prevent save.
- **DATA MANIPULATION RULE**: If the requirement is about calculating, deriving, or setting field values on save (NOT validation), use "SavePreChange". SavePreChange runs after SaveEdit and does NOT allow Error/Warning.
- **FIELD TARGET RULE**: If the validation targets a single field's value (e.g. 'Amount is not zero'), set "field" to that field name AND set "eventHint" to "SaveEdit" on that specific field. ONLY use "level": "record" if the logic involves multiple fields.
- **BUTTON/CLICK RULE**: If the requirement involves a button click or user-triggered action, use eventHint "FieldChange" on the button field. The target record is typically a DERIVED record (DERIVED_*, *_WRK) that holds the button field.
- **PAGE SECURITY RULE**: If the requirement is about page-level security, role-based access, or page-specific initialization, use eventHint "Activate".
- **EFFECTIVE DATE RULE**: If the requirement mentions "effective date", "default EFFDT", or "history row", AND the target record's isEffDated is true, add "%EffDtCheck effective date SQL PeopleCode" AND "%Mode Add Update Correction effective date PeopleCode" to additionalRagQueries.
- **DERIVED RECORD RULE**: If the requirement targets a button or a display-only calculated field, use the DERIVED or _WRK record that holds that field. This is the ONE exception to the RECORD PRIORITY rule — buttons legitimately live on derived records.
- **APPLICATION CLASS RULE**: If the requirement mentions a "class", "method", "application package", "object-oriented", or logic that must be reused across events/components, keep eventHint as the host event that calls the class, and add "Application Class import class method property extends create instantiate PeopleCode" to additionalRagQueries. Do NOT invent an eventHint of "AppClass" — it is not an event.
- **SEARCH RULE**: Use the Field Metadata list below to scan the actual columns of every table. If the user asks to validate a specific concept (e.g. "amount", "date", "status"), read the column lists and cleanly align it with the exact Physical Record that houses that data (e.g., matching "amount" to a table that physically contains the MERCHANDISE_AMT field). NEVER guess or invent field names. If a target field is not in the list, state it explicitly.
- Set hasSetId, isEffDated, and scrollLevel from the Field Metadata section above
- Set requiresLoop: true if the logic needs to iterate over multiple rows (e.g. "for each line", "all lines", "every row")
- Populate additionalRagQueries with:
  - If hasSetId is true: "GetSetId SetID resolution PeopleCode"
  - If isEffDated is true: "%EffDtCheck effective date SQL PeopleCode"
  - If scrollLevel > 0: "ActiveRowCount GetRow scroll loop PeopleCode"
  - If requiresLoop is true: "For loop ActiveRowCount rowset PeopleCode"
  - If eventHint is "RowInit": "RowInit GetField Visible Enabled UI PeopleCode"
  - Always include: "MsgGetText message catalog error PeopleCode"
- Return ONLY valid JSON array. No other text.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the field metadata section of the prompt.
 * Shows which records have SETID, EFFDT, and their scroll levels.
 *
 * @param {{ byRecord: Record<string, { hasSetId: boolean, isEffDated: boolean, scrollLevel: number }> }} [fieldMetadata]
 * @returns {string}
 */
function buildFieldMetaSection(fieldMetadata) {
  if (!fieldMetadata?.byRecord) return '';

  const entries = Object.entries(fieldMetadata.byRecord);
  if (entries.length === 0) return '';

  const lines = entries.map(([record, meta]) => {
    const flags = [];
    if (meta.hasSetId)        flags.push('has SETID');
    if (meta.isEffDated)      flags.push('effective-dated (EFFDT)');
    if (meta.scrollLevel > 0) flags.push(`scroll level ${meta.scrollLevel}`);
    const flagStr = flags.length > 0 ? flags.join(', ') : 'no special flags';
    const fieldStr = (meta.fields && meta.fields.length > 0) ? `Fields: ${meta.fields.join(', ')}` : 'Fields: unknown';
    return `  ${record}: [${flagStr}] ${fieldStr}`;
  });

  return `\nField Metadata:\n${lines.join('\n')}\n`;
}

/**
 * Convert the raw allRecords response into a comma-separated string.
 * Handles arrays of objects, arrays of strings, and plain strings.
 *
 * @param {unknown} records
 * @returns {string}
 */
function buildFallback(requirement, records) {
  const isUiOp = /gray|hide|visible|enabl|disabl|unhide/i.test(requirement);
  return [
    {
      requirement,
      record:         primaryRecordName(records),
      field:          null,
      eventHint:      isUiOp ? 'RowInit' : 'FieldEdit',
      level:          'field',
      executionOrder: 1,
    },
  ];
}

function recordsToList(records) {
  if (!records) return 'unknown';

  if (Array.isArray(records)) {
    return records
      .map((r) => {
        return r?.record_name ?? r?.recordName ?? r?.name ?? JSON.stringify(r);
      })
      .filter(Boolean)
      .join(', ') || 'unknown';
  }

  if (records.records && Array.isArray(records.records)) {
    return recordsToList(records.records);
  }

  return typeof records === 'string' ? records : 'unknown';
}

export { SYSTEM_PROMPT, buildUserPrompt };
