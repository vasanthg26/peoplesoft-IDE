/**
 * providers/gemini.js
 * Google Gemini provider using the @google/generative-ai SDK.
 *
 * Models:
 *   - gemini-1.5-pro   → GENERATE (deep code generation)
 *   - gemini-1.5-flash → DECOMPOSE (fast YES/NO relevance scanning)
 *
 * Set in .env:
 *   GEMINI_API_KEY=AIza...
 *   GENERATE_PROVIDER=gemini
 *   GENERATE_MODEL=gemini-1.5-pro
 *   DECOMPOSE_PROVIDER=gemini
 *   DECOMPOSE_MODEL=gemini-1.5-flash
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
  const geminiModel = genAI.getGenerativeModel({
    model,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  });

  // Convert messages to Gemini's role format (user/model instead of user/assistant)
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  const chat = geminiModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

export { complete };
