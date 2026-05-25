/**
 * llmConfig.js
 * Reads LLM provider/model configuration from environment variables per task.
 *
 * Env vars (with defaults):
 *   DECOMPOSE_PROVIDER  — provider for decomposition task  (default: anthropic)
 *   DECOMPOSE_MODEL     — model for decomposition task     (default: claude-haiku-4-5-20251001)
 *   GENERATE_PROVIDER   — provider for code generation     (default: anthropic)
 *   GENERATE_MODEL      — model for code generation        (default: claude-sonnet-4-20250514)
 */

const DEFAULTS = {
  decompose: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  },
  generate: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  analyze: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  filter: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  },
  parse: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  },
};

/**
 * Get provider + model configuration for a given pipeline task.
 *
 * @param {'decompose' | 'generate' | 'analyze' | 'filter'} task
 * @returns {{ provider: string, model: string }}
 */
function getConfig(task) {
  if (task === 'decompose') {
    return {
      provider: process.env.DECOMPOSE_PROVIDER ?? DEFAULTS.decompose.provider,
      model:    process.env.DECOMPOSE_MODEL    ?? DEFAULTS.decompose.model,
    };
  }

  if (task === 'generate') {
    return {
      provider: process.env.GENERATE_PROVIDER ?? DEFAULTS.generate.provider,
      model:    process.env.GENERATE_MODEL    ?? DEFAULTS.generate.model,
    };
  }

  if (task === 'analyze') {
    return {
      provider: process.env.ANALYZE_PROVIDER ?? DEFAULTS.analyze.provider,
      model:    process.env.ANALYZE_MODEL    ?? DEFAULTS.analyze.model,
    };
  }

  if (task === 'filter') {
    return {
      provider: process.env.FILTER_PROVIDER ?? DEFAULTS.filter.provider,
      model:    process.env.FILTER_MODEL    ?? DEFAULTS.filter.model,
    };
  }

  if (task === 'parse') {
    return {
      provider: process.env.PARSE_PROVIDER ?? DEFAULTS.parse.provider,
      model:    process.env.PARSE_MODEL    ?? DEFAULTS.parse.model,
    };
  }

  throw new Error(`Unknown task: "${task}". Expected "decompose", "generate", "analyze", "filter", or "parse".`);
}

export { getConfig };
