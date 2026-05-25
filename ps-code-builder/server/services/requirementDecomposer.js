/**
 * requirementDecomposer.js
 * Uses a fast LLM (Haiku by default) to decompose a compound business
 * requirement into an array of discrete technical implementation units.
 *
 * Each unit targets exactly one record + field + event, making it possible
 * to generate separate, focused PeopleCode blocks for each.
 *
 * Returns array of:
 * {
 *   requirement:    string  — focused sub-requirement text
 *   record:         string  — target RECORD_NAME
 *   field:          string | null
 *   eventHint:      string  — suggested PS event
 *   level:          'field' | 'record' | 'component'
 *   executionOrder: number
 * }
 */

import { complete } from './llm/llmClient.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './llm/prompts/decompose.js';

// ---------------------------------------------------------------------------
// decompose()
// ---------------------------------------------------------------------------

/**
 * Decompose a business requirement into technical units.
 *
 * @param {string}  requirement   - Full requirement text from the developer
 * @param {string}  componentName - Component being worked on
 * @param {unknown} records       - Raw getAllRecords() result (for context)
 * @returns {Promise<Array<{
 *   requirement:    string,
 *   record:         string,
 *   field:          string | null,
 *   eventHint:      string,
 *   level:          string,
 *   executionOrder: number,
 * }>>}
 */
async function decompose(requirement, componentName, records, fieldMetadata) {
  const userPrompt = buildUserPrompt(requirement, componentName, records, fieldMetadata);

  let responseText;
  try {
    responseText = await complete({
      task: 'decompose',
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 1024,
      systemPrompt: SYSTEM_PROMPT,
    });
  } catch (err) {
    console.error('[requirementDecomposer] LLM call failed:', err.message);
    return buildFallback(requirement, records);
  }

  let units;
  try {
    // Strip accidental markdown fences if the model ignores the system prompt
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    units = JSON.parse(cleaned);

    if (!Array.isArray(units) || units.length === 0) {
      throw new Error('Response is not a non-empty JSON array');
    }
  } catch (err) {
    console.error(
      '[requirementDecomposer] JSON parse failed:',
      err.message,
      '— raw response:',
      responseText.slice(0, 300)
    );
    return buildFallback(requirement, records);
  }

  // Sort by executionOrder (ascending) so units are processed in logical sequence
  return units.sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0));
}

// ---------------------------------------------------------------------------
// Fallback — single unit wrapping the full requirement
// ---------------------------------------------------------------------------

/**
 * When decomposition fails, treat the whole requirement as one unit.
 *
 * @param {string}  requirement
 * @param {unknown} records
 * @returns {Array}
 */
function buildFallback(requirement, records) {
  const isUiOp = /gray|hide|visible|enabl|disabl|unhide/i.test(requirement);
  return [
    {
      requirement,
      record:               primaryRecordName(records),
      field:                null,
      eventHint:            isUiOp ? 'RowInit' : 'FieldEdit',
      level:                'field',
      executionOrder:       1,
      hasSetId:             false,
      isEffDated:           false,
      scrollLevel:          0,
      requiresLoop:         false,
      additionalRagQueries: ['MsgGetText message catalog error PeopleCode'],
    },
  ];
}

/**
 * Extract a best-guess primary record name from the raw records result.
 *
 * @param {unknown} records
 * @returns {string}
 */
function primaryRecordName(records) {
  if (!records) return 'UNKNOWN';

  if (Array.isArray(records)) {
    const first = records[0];
    if (!first) return 'UNKNOWN';
    return (
      first?.record_name ??
      first?.recordName ??
      first?.name ??
      (typeof first === 'string' ? first : 'UNKNOWN')
    );
  }

  if (records.records && Array.isArray(records.records)) {
    return primaryRecordName(records.records);
  }

  return typeof records === 'string' ? records : 'UNKNOWN';
}

export { decompose };
