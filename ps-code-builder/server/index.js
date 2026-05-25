/**
 * server/index.js
 * Express entry point for PS Code Builder backend.
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import healthRouter from './routes/health.js';
import generateRouter from './routes/generate.js';
import notifier from './services/notifier.js';

const PORT = process.env.PORT || 4000;

const app = express();
const server = createServer(app);

// ── WebSocket Init ────────────────────────────────────────────────────────────
notifier.init(server);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(healthRouter);
app.use(generateRouter);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[server] PS Code Builder running on http://localhost:${PORT}`);
});
