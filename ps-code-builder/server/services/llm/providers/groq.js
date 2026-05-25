/**
 * providers/groq.js
 * Groq provider — uses OpenAI-compatible SDK pointed at Groq's API.
 *
 * Models:
 *   - llama-3.3-70b-versatile → GENERATE (strong code generation)
 *   - llama-3.3-70b-versatile → DECOMPOSE (accurate JSON classification)
 *
 * Set in .env:
 *   GROQ_API_KEY=gsk_...
 *   GENERATE_PROVIDER=groq
 *   GENERATE_MODEL=llama-3.3-70b-versatile
 *   DECOMPOSE_PROVIDER=groq
 *   DECOMPOSE_MODEL=llama-3.3-70b-versatile
 */

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey:  process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

/**
 * @param {{
 *   messages:      Array<{ role: 'user' | 'assistant', content: string }>,
 *   model:         string,
 *   maxTokens?:    number,
 *   systemPrompt?: string,
 * }} opts
 * @returns {Promise<string>}
 */
async function complete({ messages, model, maxTokens = 8192, systemPrompt }) {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const response = await client.chat.completions.create({
    model,
    messages: allMessages,
    max_tokens: maxTokens,
  });

  return response.choices[0].message.content;
}

export { complete };
