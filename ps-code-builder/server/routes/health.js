/**
 * health.js
 * GET /health — liveness + dependency connectivity check.
 */

import { Router } from 'express';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const router = Router();

/** Probe a URL with a HEAD request; returns 'connected' or 'unreachable'. */
async function probe(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500 ? 'connected' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

router.get('/health', async (_req, res) => {
  const [mcpServer, ragApi] = await Promise.allSettled([
    probe(MCP_SERVER_URL),
    probe(RAG_API_URL),
  ]);

  res.json({
    status: 'ok',
    mcpServer: mcpServer.value ?? 'unreachable',
    ragApi: ragApi.value ?? 'unreachable',
    claudeApi: ANTHROPIC_API_KEY ? 'connected' : 'missing key',
  });
});

export default router;
