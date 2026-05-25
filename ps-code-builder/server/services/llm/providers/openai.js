/**
 * providers/openai.js
 * Placeholder for future OpenAI integration.
 *
 * TODO: To implement:
 *   1. Install the openai package: npm install openai
 *   2. Import and initialise the client:
 *        import OpenAI from 'openai';
 *        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 *   3. Map the messages array to the OpenAI chat format (it's already compatible)
 *   4. Call: client.chat.completions.create({ model, max_tokens: maxTokens, messages, system_message... })
 *   5. Return: response.choices[0].message.content
 *   6. Set GENERATE_PROVIDER=openai and GENERATE_MODEL=gpt-4o in .env
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
  throw new Error('OpenAI provider not yet implemented');
}

export { complete };
