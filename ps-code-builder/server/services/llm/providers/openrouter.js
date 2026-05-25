/**
 * providers/openrouter.js
 * Placeholder for future OpenRouter integration.
 *
 * OpenRouter exposes an OpenAI-compatible API, so implementation is straightforward.
 *
 * TODO: To implement:
 *   1. Install the openai package: npm install openai
 *   2. Import and initialise with the OpenRouter base URL:
 *        import OpenAI from 'openai';
 *        const client = new OpenAI({
 *          baseURL: 'https://openrouter.ai/api/v1',
 *          apiKey: process.env.OPENROUTER_API_KEY,
 *        });
 *   3. Optionally add OpenRouter-specific headers via defaultHeaders:
 *        { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL, 'X-Title': 'PS Code Builder' }
 *   4. Call: client.chat.completions.create({ model, max_tokens: maxTokens, messages })
 *   5. Return: response.choices[0].message.content
 *   6. Set GENERATE_PROVIDER=openrouter and GENERATE_MODEL=<any openrouter model> in .env
 */

/**
 * @param {{
 *   messages:     Array<{ role: 'user' | 'assistant', content: string }>,
 *   model:        string,
 *   maxTokens?:   number,
 *   systemPrompt?: string,
 * }} opts
 * @returns {Promise<string>}
 */
async function complete({ messages, model, maxTokens = 4096, systemPrompt }) {
  throw new Error('OpenRouter provider not yet implemented');
}

export { complete };
