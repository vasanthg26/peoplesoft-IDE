'use strict';

require('dotenv').config();

const express                = require('express');
const cors                   = require('cors');
const { initDb, closeDb, getMode } = require('./db/config');

const getComponentStructure = require('./tools/getComponentStructure');
const getAllRecords          = require('./tools/getAllRecords');
const getFieldsByRecord     = require('./tools/getFieldsByRecord');
const getPeopleCodeByEvent  = require('./tools/getPeopleCodeByEvent');
const getFunclibFunctions   = require('./tools/getFunclibFunctions');
const getTranslateValues    = require('./tools/getTranslateValues');

const TOOLS = [
  getComponentStructure,
  getAllRecords,
  getFieldsByRecord,
  getPeopleCodeByEvent,
  getFunclibFunctions,
  getTranslateValues,
];

// ── Graceful shutdown ────────────────────────────────────────────────────────
function registerShutdownHandlers() {
  async function shutdown(signal) {
    console.error(`[server] Received ${signal} — shutting down.`);
    await closeDb();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught exception:', err.message);
    // Keep running — per error contract, errors must not crash the server.
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  // 1. Initialise DB layer (falls back to mock on any failure)
  const { mode, error: dbError } = await initDb();

  console.error('─'.repeat(60));
  console.error(' PeopleSoft API Server');
  console.error('─'.repeat(60));
  console.error(` Mode : ${mode === 'mock' ? 'MOCK (no DB connection)' : 'LIVE (Oracle DB)'}`);
  if (dbError) {
    console.error(` DB   : ${dbError}`);
  }
  console.error('─'.repeat(60));

  // 2. Wire shutdown handlers
  registerShutdownHandlers();

  // 3. HTTP Server 
  const app = express();
  app.use(cors());
  app.use(express.json()); // Essential for parsing POST /call JSON payloads natively

  // Directly map the UI Orchestrator's /call endpoint to the Oracle handlers
  app.post('/call', async (req, res) => {
    const { tool: toolName, params } = req.body;
    
    // Find matching query logic
    const tool = TOOLS.find(t => t.name === toolName);
    
    console.error(`[server] 🚀 Tool Invoked: ${toolName}`);
    console.error(`[server] 📦 Parameters: ${JSON.stringify(params)}`);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${toolName}` });
    }

    try {
      const result = await tool.handler(params || {});
      // Safely serialize — oracledb connection objects can cause circular ref crashes
      const safe = JSON.parse(JSON.stringify(result, (key, value) => {
        // Strip any Oracle internal objects that are not plain-data
        if (value && typeof value === 'object' && value.constructor &&
            !['Object', 'Array', 'String', 'Number', 'Boolean', 'null'].includes(value.constructor.name)) {
          return undefined;
        }
        return value;
      }));
      return res.json({ result: safe });
    } catch (err) {
      console.error(`[server] Tool ${toolName} Error:`, err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.error(`[server] Ready — ${TOOLS.length} native API endpoints available.`);
    console.error(`[server] Mode: ${getMode().toUpperCase()}`);
    console.error(`[server] HTTP Server listening at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err.message);
  process.exit(1);
});
