/**
 * providers/anthropic.js
 * LLM provider implementation for Anthropic Claude API.
 * Uses the @anthropic-ai/sdk package already installed in this project.
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialise once — the SDK reads ANTHROPIC_API_KEY automatically
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Send a completion request to the Anthropic API.
 *
 * @param {{
 *   messages:     Array<{ role: 'user' | 'assistant', content: string }>,
 *   model:        string,
 *   maxTokens?:   number,
 *   systemPrompt?: string,
 *   tools?:        Array<object>,
 * }} opts
 * @returns {Promise<{ text: string, toolCalls: Array, stopReason: string }>}
 */
/**
 * Send a completion request to the Anthropic API.
 * Implements prompt caching by segmenting messages into cache-controlled blocks.
 */
async function complete({ messages, model, maxTokens = 4096, systemPrompt, tools }) {
  // Transform messages to support prompt caching if delimiters are detected
  const processedMessages = messages.map((msg) => {
    if (msg.role !== 'user' || typeof msg.content !== 'string') return msg;
    if (!msg.content.includes('### [BLOCK:')) return msg;

    // Split by the block delimiters
    const parts = msg.content.split(/(?=### \[BLOCK:)/);
    const contentBlocks = parts.map((part) => {
      const block = { type: 'text', text: part.trim() + '\n\n' };
      
      // Cache the Style Guide and Metadata blocks
      if (part.includes('[BLOCK:STYLE_GUIDE]') || part.includes('[BLOCK:METADATA]')) {
        block.cache_control = { type: 'ephemeral' };
      }
      return block;
    });

    return { ...msg, content: contentBlocks };
  });

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(systemPrompt ? {
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      } : {}),
      ...(tools ? { tools } : {}),
      messages: processedMessages,
    });
  } catch (err) {
    throw new Error(`Anthropic API error (model: ${model}): ${err.message}`);
  }

  // Log cache performance for verification
  const usage = response.usage || {};
  const cacheHit = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const inputTokens = usage.input_tokens || 0;
  
  if (cacheHit > 0 || cacheCreation > 0) {
    console.log(`[anthropic] Prompt Cache Status: HIT=${cacheHit} | CREATION=${cacheCreation} | DYNAMIC=${inputTokens}`);
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const toolCalls = response.content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id:   block.id,
      name: block.name,
      args: block.input,
    }));

  return { 
    text, 
    toolCalls, 
    stopReason: response.stop_reason 
  };
}

export { complete };
