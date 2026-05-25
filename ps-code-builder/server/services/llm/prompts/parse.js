/**
 * prompts/parse.js
 * System and user prompt builders for the PeopleCode block parser task.
 * Used by codeParser.js (Haiku) to extract structured metadata from a pasted
 * PeopleCode event block before paste-mode code generation.
 */

const SYSTEM_PROMPT = `You are a PeopleSoft code analyst.
Your ONLY job is to extract structured metadata from a PeopleCode event block.
Rules:
- Return ONLY valid JSON — no explanations, no markdown, no code fences
- Extract record names, field names, and variable declarations exactly as they appear in the code
- Infer scroll levels from GetRowset nesting depth (L0=GetLevel0 only, L1=first GetRowset, L2=nested GetRowset inside a loop)
- Set hasSetId: true only if GetSetId( appears
- Set isEffDated: true only if EFFDT is referenced as a field or %EffDtCheck appears`;

/**
 * Build the user prompt asking Haiku to parse a pasted PeopleCode block.
 *
 * @param {string} pastedCode   - The full PeopleCode event block pasted by the developer
 * @param {string} requirement  - The new NL requirement (context only — do not generate code)
 * @returns {string}
 */
function buildUserPrompt(pastedCode, requirement) {
  return `Analyze this PeopleCode block and extract structured metadata.

PASTED CODE:
${pastedCode}

NEW REQUIREMENT (context only — do not generate code):
${requirement}

Return a JSON object with this exact shape:
{
  "primaryRecord": "the main record this code operates on",
  "records": ["all record names found in the code"],
  "fields": ["all field names referenced — deduplicated, no record prefix"],
  "variables": [
    { "name": "&varName", "type": "Rowset|Row|Record|integer|string|number|boolean|date", "record": "RecordName or null" }
  ],
  "scrollLevel": 0,
  "hasSetId": false,
  "isEffDated": false,
  "summary": "one sentence describing what this code currently does"
}

Extraction rules:
- primaryRecord: the record most central to the logic — avoid _WRK, _FS, _STG, _VW records unless only one record is present
- records: scan for Scroll.X, Record.X, and RECORD.FIELD.Value dot-notation patterns
- fields: extract the field name portion only (e.g. from PO_LINE.MERCHANDISE_AMT.Value extract MERCHANDISE_AMT)
- variables: every Local declaration — include the type keyword and the bound record if it is a Rowset/Row/Record
- scrollLevel: the maximum scroll level the code operates on (0 if only GetLevel0, 1 if GetRowset is used, 2 if nested)
- Return ONLY valid JSON. No other text.`;
}

export { SYSTEM_PROMPT, buildUserPrompt };
