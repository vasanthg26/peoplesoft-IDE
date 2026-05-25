/**
 * analysisAgent.js
 * Analyzes existing code and requirements to generate a technical proposal
 * before any code is actually generated.
 */

import { complete } from './llm/llmClient.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './llm/prompts/analysis.js';

/**
 * Generate a technical proposal based on the gathered context.
 * 
 * @param {string} requirement - The full business requirement
 * @param {object} context - Object containing componentStructure and unitsContext (gathered data)
 * @returns {Promise<string>} - Markdown proposal
 */
async function analyze(requirement, context) {
  const userPrompt = buildUserPrompt(requirement, context);

  try {
    const proposal = await complete({
      task: 'analyze',
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      systemPrompt: SYSTEM_PROMPT,
    });

    return proposal;
  } catch (err) {
    console.error('[analysisAgent] Analysis failed:', err.message);
    throw new Error(`Technical analysis failed: ${err.message}`);
  }
}

export { analyze };
