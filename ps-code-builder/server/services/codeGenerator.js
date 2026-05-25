/**
 * codeGenerator.js
 * Sends the assembled prompt to the configured LLM and parses the structured
 * response back into discrete fields.
 *
 * Claude is instructed (via llm/prompts/generate.js SYSTEM_PROMPT) to respond with:
 *
 *   **Event**: <EventName>
 *   **Record**: <RecordName>
 *   **Field**: <FieldName or "N/A">
 *   **Location Format**: <RECORD.FIELD.Event | RECORD.Event | COMPONENT.Event | PAGE.Event>
 *   **Location**: <full dotted path, e.g. PO_HDR.VENDOR_ID.FieldChange>
 *   **Alternative Location**: <alternative path or "N/A">
 *   **Page**: <page name for Activate, or "N/A">
 *
 *   ```peoplecode
 *   <generated code>
 *   ```
 *
 *   **Explanation**
 *   <plain-English explanation>
 *
 *   **Sources Used**
 *   - <source 1>
 */

import { complete } from './llm/llmClient.js';
import { SYSTEM_PROMPT, TOOLS } from './llm/prompts/generate.js';
import { getPeopleCodeByEvent } from './mcpClient.js';
import { filterRelevantCode } from './codeContextFilter.js';
import { loadCodingStyle } from './contextBuilder.js';

// ---------------------------------------------------------------------------
// generate()
// ---------------------------------------------------------------------------

/**
 * Send the assembled prompt to the generation LLM and return parsed output.
 * Implements an agentic loop to support the "Pause & Harvest" protocol.
 *
 * @param {string} prompt  Complete user prompt from contextBuilder.build()
 * @returns {Promise<{
 *   generatedCode: string,
 *   suggestedEvent: string,
 *   suggestedRecord: string,
 *   suggestedField: string,
 *   locationFormat: string,
 *   location: string,
 *   alternativeLocation: string,
 *   suggestedPage: string,
 *   explanation: string,
 *   sources: string[],
 *   rawResponse: string
 * }>}
 */
async function generate(prompt) {
  const messages = [{ role: 'user', content: prompt }];
  let lastText = '';

  // Coding style is a standing rule — belongs in system prompt, not user message
  const codingStyle    = await loadCodingStyle();
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n## CODING STYLE GUIDE\n${codingStyle}`;

  // Maximum 3 loops to prevent infinite cycles/runaway costs
  const MAX_AGENT_STEPS = 3;

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    let result;
    try {
      result = await complete({
        task: 'generate',
        messages,
        maxTokens: 16384,
        systemPrompt: fullSystemPrompt,
        tools: TOOLS,
      });
    } catch (err) {
      console.error('[codeGenerator] LLM error:', err.message);
      throw new Error(`Code generation failed: ${err.message}`);
    }

    const { text, toolCalls, stopReason } = typeof result === 'string' 
      ? { text: result, toolCalls: [], stopReason: 'end_turn' } 
      : result;

    lastText = text || lastText;

    // If no tool calls were made, we are done
    if (!toolCalls || toolCalls.length === 0) {
      return parseResponse(lastText);
    }

    // Process tool calls
    console.log(`[codeGenerator] Agentic step ${step + 1}: LLM requested ${toolCalls.length} tool call(s)`);
    
    // Track the assistant's message that contains the tool use
    messages.push({
      role: 'assistant',
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...toolCalls.map(tc => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.args
        }))
      ]
    });

    for (const toolCall of toolCalls) {
      if (toolCall.name === 'get_peoplecode_by_event') {
        const { record_name, field_name, event_name } = toolCall.args;
        console.log(`[codeGenerator] Harvesting existing code for ${record_name}.${field_name || '(rec)'}.${event_name}`);
        
        try {
          const codeData = await getPeopleCodeByEvent(record_name, field_name || '', event_name);
          
          // SURGICAL FIX: Prune the harvested code before injecting it back into Sonnet.
          // This prevents 100k+ token dumps from complex PeopleSoft records.
          // Uses the unit requirement for semantic relevance.
          const filteredData = await filterRelevantCode(codeData, prompt); // Using prompt as context
          
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(filteredData, null, 2)
            }]
          });
        } catch (mcpErr) {
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              is_error: true,
              content: `Error harvesting code: ${mcpErr.message}`
            }]
          });
        }
      } else {
        // Unknown tool
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            is_error: true,
            content: `Unknown tool: ${toolCall.name}`
          }]
        });
      }
    }

    // Loop continues to let model process tool results
  }

  // Fallback if we exceeded MAX_AGENT_STEPS
  return parseResponse(lastText);
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

/**
 * Parse the model's structured text response into discrete fields.
 * All parsers are tolerant — a missed section returns '' / [] rather than
 * throwing, so partial results still surface to the caller.
 *
 * @param {string} text  Full raw response from the model
 * @returns {object}
 */
function parseResponse(text) {
  const locationRaw = extractMetaLabel(text, 'Location');
  const altRaw      = extractMetaLabel(text, 'Alternative Location');
  const pageRaw     = extractMetaLabel(text, 'Page');

  return {
    generatedCode:       extractCode(text),
    suggestedEvent:      extractMetaLabel(text, 'Event'),
    suggestedRecord:     extractMetaLabel(text, 'Record'),
    suggestedField:      extractMetaLabel(text, 'Field'),
    locationFormat:      extractMetaLabel(text, 'Location Format'),
    location:            locationRaw === 'N/A' ? '' : locationRaw,
    alternativeLocation: altRaw === 'N/A' ? '' : altRaw,
    suggestedPage:       pageRaw === 'N/A' ? '' : pageRaw,
    explanation:         extractSection(text, 'Explanation', 'Sources Used'),
    sources:             extractSources(text),
    rawResponse:         text,
  };
}

/**
 * Extract the first fenced code block (```peoplecode or plain ```).
 * Strips the language tag line.
 */
function extractCode(text) {
  const match = text.match(/```(?:peoplecode|PeopleCode)?\r?\n([\s\S]*?)```/i);
  if (match) return match[1].trim();

  // Fallback: indented block after the metadata header lines
  const indentMatch = text.match(/(?:\*\*Field\*\*[^\n]*\n\s*\n)((?:[ \t][^\n]*\n)+)/i);
  return indentMatch ? indentMatch[1].trim() : '';
}

/**
 * Extract a bold metadata label value, e.g. **Event**: FieldChange
 * Handles variations: `**Event**:`, `**Event** :`, `Event:`, `*Event*:`
 *
 * @param {string} text
 * @param {string} label
 * @returns {string}
 */
function extractMetaLabel(text, label) {
  // Escape any regex special chars in the label (spaces in "Location Format" etc.)
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\*{0,2}${escapedLabel}\\*{0,2}\\s*:\\s*([^\\n\\r]+)`,
    'i'
  );
  const match = text.match(pattern);
  if (!match) return '';
  return match[1].trim().replace(/\*+/g, '').trim();
}

/**
 * Extract the text content between two section headings.
 *
 * @param {string} text
 * @param {string} startHeading  Section to extract (e.g. 'Explanation')
 * @param {string} endHeading    Section that terminates it (e.g. 'Sources Used')
 */
function extractSection(text, startHeading, endHeading) {
  const start = `(?:#{1,3}\\s*|\\*{1,2})${startHeading}\\*{0,2}`;
  const end   = endHeading ? `(?:#{1,3}\\s*|\\*{1,2})${endHeading}` : null;

  const pattern = end
    ? new RegExp(`${start}[^\\n]*\\n([\\s\\S]*?)(?=${end}|$)`, 'i')
    : new RegExp(`${start}[^\\n]*\\n([\\s\\S]*)`, 'i');

  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

/**
 * Extract bullet-point sources from the **Sources Used** section.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractSources(text) {
  const section = extractSection(text, 'Sources Used', '');
  if (!section) return [];

  return section
    .split('\n')
    .map((line) => line.replace(/^[\s\-→*•]+/, '').trim())
    .filter((line) => line.length > 0);
}

export { generate };
