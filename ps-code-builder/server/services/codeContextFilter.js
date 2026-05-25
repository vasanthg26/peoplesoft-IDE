/**
 * codeContextFilter.js
 * Uses Haiku (fast/cheap) to batch-scan existing PeopleCode event blocks
 * and determine their relevance to the current requirement.
 *
 * This version uses "Surgical Batching" to avoid 60+ redundant LLM calls
 * for complex records, performing the check in 1-2 calls total.
 */

import { complete } from './llm/llmClient.js';

const MAX_CODE_PREVIEW = 500; // chars per block for the audit inventory

/**
 * Filter existingCode down to only the event blocks that Haiku deems relevant.
 * Uses a single-call batch strategy.
 *
 * @param {object|null} existingCode 
 * @param {string}      requirement 
 * @returns {Promise<object|null>}
 */
async function filterRelevantCode(existingCode, requirement) {
  if (!existingCode || !requirement) return existingCode;

  const fieldEvents  = existingCode.field_events  || existingCode.peoplecode || [];
  const recordEvents = existingCode.record_events || [];

  if (fieldEvents.length === 0 && recordEvents.length === 0) return existingCode;

  console.log(`[contextFilter] Starting batch scan of ${fieldEvents.length + recordEvents.length} total events...`);

  // We process fields and records in two separate batches to keep prompt context clean.
  const filteredField  = await batchFilter(fieldEvents, requirement, 'FIELD');
  const filteredRecord = await batchFilter(recordEvents, requirement, 'RECORD');

  console.log(
    `[contextFilter] Kept ${filteredField.length}/${fieldEvents.length} field event(s), ` +
    `${filteredRecord.length}/${recordEvents.length} record event(s) as relevant`
  );

  return {
    ...existingCode,
    field_events:  filteredField,
    record_events: filteredRecord,
  };
}

/**
 * Perform a batched relevance scan for an array of event blocks.
 */
async function batchFilter(events, requirement, typeLabel) {
  if (events.length === 0) return [];

  // Build the inventory list
  const inventory = events.map((e, index) => {
    const name = e.field_name ? `${e.field_name}.${e.event_name}` : e.event_name;
    const preview = (e.code || '').slice(0, MAX_CODE_PREVIEW).replace(/\s+/g, ' ');
    return `[${index + 1}] ${name} Preview: ${preview}`;
  }).join('\n\n');

  try {
    const response = await complete({
      task:      'filter', // Uses the new filter config
      maxTokens: 300,
      messages: [{
        role:    'user',
        content: `As a PeopleSoft Architect, identify which of the following ${typeLabel} event blocks are relevant to this requirement.
        
Requirement: "${requirement}"

EVENT INVENTORY:
${inventory}

Return ONLY a JSON array of the 1-based indices that are relevant. 
Example Output: [1, 4, 12]
If none are relevant, return: []`
      }],
    });

    // Parse the JSON array from the response
    const match = response.match(/\[.*\]/);
    if (!match) return events; // Safety fallback: include all if parsing fails

    const relevantIndices = JSON.parse(match[0]);
    
    // Convert 1-based indices to 0-based and filter
    return events.filter((_, i) => relevantIndices.includes(i + 1));

  } catch (err) {
    console.warn(`[contextFilter] Batch scan failed for ${typeLabel} events:`, err.message);
    return events; // Safety fallback
  }
}

export { filterRelevantCode };
