/**
 * llmClient.js
 * Unified LLM client — routes completion requests to the correct provider
 * based on the task type configured in llmConfig.js.
 *
 * Usage:
 *   import { complete } from './llm/llmClient.js';
 *   const text = await complete({ task: 'generate', messages: [...], maxTokens: 4096, systemPrompt });
 */

import { getConfig } from './llmConfig.js';
import { complete as anthropicComplete }  from './providers/anthropic.js';
import { complete as openaiComplete }     from './providers/openai.js';
import { complete as openrouterComplete } from './providers/openrouter.js';
import { complete as geminiComplete }     from './providers/gemini.js';
import { complete as groqComplete }       from './providers/groq.js';

const PROVIDERS = {
  anthropic:  anthropicComplete,
  openai:     openaiComplete,
  openrouter: openrouterComplete,
  gemini:     geminiComplete,
  groq:       groqComplete,
};

/**
 * Route a completion request to the configured provider for this task.
 *
 * @param {{
 *   task:          'decompose' | 'generate',
 *   messages:      Array<{ role: 'user' | 'assistant', content: string }>,
 *   maxTokens?:    number,
 *   systemPrompt?: string,
 * }} opts
 * @returns {Promise<string>}  Raw text response from the model
 */
/**
 * @param {{
 *   task:          'decompose' | 'generate',
 *   messages:      Array<{ role: 'user' | 'assistant', content: string }>,
 *   maxTokens?:    number,
 *   systemPrompt?: string,
 *   tools?:        Array<object>,
 * }} opts
 * @returns {Promise<string | { text: string, toolCalls: Array, stopReason: string }>}
 */
async function complete({ task, messages, maxTokens, systemPrompt, tools }) {
  const { provider, model } = getConfig(task);

  const providerFn = PROVIDERS[provider];
  if (!providerFn) {
    throw new Error(
      `Unknown provider: "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  console.log(`[llmClient] task=${task} provider=${provider} model=${model} tools=${tools?.length ?? 0}`);

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 20000; 

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await providerFn({ messages, model, maxTokens, systemPrompt, tools });
      
      // Backward compatibility: If no tools were requested, just return the text string.
      // If tools were used/returned, return the full object.
      if (!tools && typeof result === 'object' && result.text !== undefined) {
        return result.text;
      }
      return result;
    } catch (err) {
      const is429 = err.status === 429
        || err.message?.includes('429')
        || err.message?.includes('rate_limit');

      const is503 = err.status === 503
        || err.message?.includes('503')
        || err.message?.includes('Service Unavailable')
        || err.message?.includes('high demand');

      const isRetryable = is429 || is503;
      const delay = is503
        ? 10000 * attempt   // 503: shorter backoff (10s/20s) — transient overload
        : BASE_DELAY_MS * attempt; // 429: longer backoff (20s/40s) — quota window reset

      if (isRetryable && attempt < MAX_RETRIES) {
        const reason = is503 ? 'Server overload (503)' : 'Rate limit (429)';
        console.log(`[llmClient] ${reason} hit (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error(`[llmClient] LLM error: ${err.message}`);
      throw err;
    }
  }
}

export { complete };
