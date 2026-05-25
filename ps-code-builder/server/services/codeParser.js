/**
 * codeParser.js
 * Uses Haiku to extract structured metadata from a pasted PeopleCode event block.
 *
 * Returns:
 * {
 *   primaryRecord: string
 *   records:       string[]
 *   fields:        string[]
 *   variables:     Array<{ name: string, type: string, record: string | null }>
 *   scrollLevel:   number
 *   hasSetId:      boolean
 *   isEffDated:    boolean
 *   summary:       string
 * }
 */

import { complete } from './llm/llmClient.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './llm/prompts/parse.js';

// ---------------------------------------------------------------------------
// parseCode()
// ---------------------------------------------------------------------------

/**
 * Extract structured metadata from a pasted PeopleCode block.
 *
 * @param {string} pastedCode   - Full PeopleCode event block
 * @param {string} requirement  - New NL requirement (used as context for the parser)
 * @returns {Promise<object>}
 */
async function parseCode(pastedCode, requirement) {
  let responseText;
  try {
    responseText = await complete({
      task: 'parse',
      messages: [{ role: 'user', content: buildUserPrompt(pastedCode, requirement) }],
      maxTokens: 1024,
      systemPrompt: SYSTEM_PROMPT,
    });
  } catch (err) {
    console.error('[codeParser] LLM call failed:', err.message);
    return buildFallback();
  }

  try {
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!parsed.primaryRecord) {
      throw new Error('Missing primaryRecord in parser response');
    }

    // Normalise arrays so downstream code never has to null-check
    parsed.records   = Array.isArray(parsed.records)   ? parsed.records   : [];
    parsed.fields    = Array.isArray(parsed.fields)    ? parsed.fields    : [];
    parsed.variables = Array.isArray(parsed.variables) ? parsed.variables : [];

    return parsed;
  } catch (err) {
    console.error(
      '[codeParser] JSON parse failed:',
      err.message,
      '— raw:',
      responseText?.slice(0, 300)
    );
    return buildFallback();
  }
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function buildFallback() {
  return {
    primaryRecord: 'UNKNOWN',
    records:       [],
    fields:        [],
    variables:     [],
    scrollLevel:   0,
    hasSetId:      false,
    isEffDated:    false,
    summary:       '(Could not parse existing code — metadata unavailable)',
  };
}

export { parseCode, buildFallback };
