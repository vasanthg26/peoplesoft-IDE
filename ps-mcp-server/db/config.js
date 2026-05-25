'use strict';

require('dotenv').config();

const { connect, disconnect, executeQuery, isConnected } = require('./oracle');
const { getMock } = require('./mock');

/**
 * Whether mock mode is active.
 * Starts as the value of USE_MOCK env var; can be promoted to true at runtime
 * if the Oracle pool fails to initialise.
 */
let mockModeActive = process.env.USE_MOCK === 'true';

/**
 * Initialise the database layer.
 *
 * - If USE_MOCK=true, skips Oracle entirely.
 * - If USE_MOCK=false (or unset), attempts Oracle pool init.
 *   On failure, silently falls back to mock mode so the server keeps running.
 *
 * Call once at server startup before registering MCP tools.
 *
 * @returns {Promise<{ mode: 'mock'|'db', error?: string }>}
 */
async function initDb() {
  if (mockModeActive) {
    console.error('[config] Mock mode enabled via USE_MOCK env var.');
    return { mode: 'mock' };
  }

  const result = await connect();

  if (!result.connected) {
    mockModeActive = true;
    console.error('[config] Oracle pool failed — falling back to mock mode.');
    return { mode: 'mock', error: result.error };
  }

  console.error('[config] Oracle pool ready.');
  return { mode: 'db' };
}

/**
 * Gracefully shut down the DB layer.
 * Safe to call in both mock and live mode.
 */
async function closeDb() {
  await disconnect();
}

/**
 * Core query function used by every MCP tool handler.
 *
 * Follows the error contract from design.md:
 * errors are returned as part of the result object, never thrown.
 *
 * @param {string}   sql      - SQL with :1, :2, … bind positions
 * @param {Array}    binds    - Positional bind values
 * @param {string}   toolName - MCP tool name, used to route mock responses
 * @returns {Promise<{ rows: object[], source: 'db'|'mock', error?: string }>}
 */
async function runQuery(sql, binds, toolName) {
  if (mockModeActive || !isConnected()) {
    const mockResponse = getMock(toolName, binds); // Pass binds down!
    return { rows: [], source: 'mock', mockResponse };
  }

  const { rows, error } = await executeQuery(sql, binds);

  if (error) {
    return { rows: [], source: 'db', error };
  }

  return { rows, source: 'db' };
}

/**
 * Expose current mode for diagnostics and tool handlers.
 * @returns {'mock'|'db'}
 */
function getMode() {
  return mockModeActive ? 'mock' : 'db';
}

module.exports = { initDb, closeDb, runQuery, getMode };
