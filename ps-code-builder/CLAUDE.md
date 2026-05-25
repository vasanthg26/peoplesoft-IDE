# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs server + client concurrently)
npm run dev

# Server only (with file-watch restart)
npm run dev:server

# Client only (Vite dev server on port 5173)
npm run dev:client

# Production build (outputs to dist/)
npm run build

# Production server
npm start
```

## External Services Required

The backend depends on two external services that must be running:

| Service | Default URL | Purpose |
|---------|-------------|---------|
| `ps-mcp-server` | `http://localhost:3000` | PeopleSoft Oracle DB — component structure, records, fields, existing PeopleCode |
| RAG API | `http://localhost:8000` | PeopleTools docs knowledge base — vector search for PeopleCode patterns |

Both are called from `server/services/mcpClient.js` and `server/services/ragClient.js` respectively. The pipeline degrades gracefully when these are unavailable (via `tryOr` fallbacks in `server/routes/generate.js`).

## Architecture

### Backend Pipeline (`server/routes/generate.js`)

The `/generate` endpoint runs a 6-step pipeline for **Component mode** (requires MCP):

1. **Component structure** — `mcpClient.getComponentStructure()`
2. **Record harvest** — `mcpClient.getAllRecords()` + field metadata
3. **Decompose** (Haiku) — `requirementDecomposer` splits requirement into atomic units (record + event + intent)
4. **Per-unit context gathering** (parallel) — event classification, RAG search, existing PeopleCode fetch, relevance filter
5. **Sequential code generation** (Sonnet) — `contextBuilder` builds the prompt, `codeGenerator` calls the LLM
6. Assemble `codeBlocks[]` response

There is also a **Paste mode** (`action: 'paste-propose'` / `'paste-execute'`) for editing existing PeopleCode without MCP. The `handlePasteMode` function in the same route handles this.

The **propose/execute two-phase flow** uses an in-memory `_contextCache` (5-min TTL, keyed by `contextId`) so the execute call skips re-running Steps 1–4 when it follows a propose.

### LLM Routing (`server/services/llm/`)

All LLM calls route through `llmClient.complete({ task, messages, ... })`. The task name determines provider + model via `llmConfig.js`:

| Task | Default Provider | Default Model |
|------|-----------------|---------------|
| `decompose` | anthropic | claude-haiku-4-5-20251001 |
| `filter` | anthropic | claude-haiku-4-5-20251001 |
| `parse` | anthropic | claude-haiku-4-5-20251001 |
| `generate` | anthropic | claude-sonnet-4-6 |
| `analyze` | anthropic | claude-sonnet-4-6 |

Override any task's provider/model via env vars (e.g. `GENERATE_PROVIDER`, `GENERATE_MODEL`). Providers implemented: `anthropic`, `openai`, `openrouter`, `gemini`, `groq`.

### Real-Time Trace (WebSocket)

`server/services/notifier.js` is a singleton WebSocket server attached to the HTTP server. During pipeline execution, `notifier.trace(msg)` broadcasts `{ type: 'TRACE', message, timestamp }` to all connected clients. The frontend (`App.jsx`) connects to `ws://localhost:4000` and renders these in `TracePanel.jsx` during loading states.

### Frontend (`client/src/`)

Single-page React app with an IDE-style layout:
- **Left pane**: Editor area — shows `TracePanel` (loading), `ProposalView` (propose phase), `CodeOutput` (final result), or `PasteConfirmCard` (paste flow)
- **Right pane**: Input panel — switches between "New Component" mode and "Edit Existing" (paste) mode

Vite proxies `/api/*` → `http://localhost:4000/*` in dev. The frontend API client in `client/src/api/generate.js` calls three endpoints: `POST /api/generate`, `POST /api/parse`.

## Key Env Vars (`.env`)

```
PORT=4000
MCP_SERVER_URL=http://localhost:3000
RAG_API_URL=http://localhost:8000
RAG_PROJECT=peoplesoft
ANTHROPIC_API_KEY=...
DECOMPOSE_PROVIDER=anthropic
DECOMPOSE_MODEL=claude-haiku-4-5-20251001
GENERATE_PROVIDER=anthropic
GENERATE_MODEL=claude-sonnet-4-6
VITE_API_URL=http://localhost:4000
```

## PeopleCode Generation Rules (Architectural Laws)

Defined in `design.md` and enforced via LLM prompts in `server/services/llm/prompts/`:
- **RULE 8.1**: No `SetCursorPos` if validation is on the same field/row in FieldEdit/FieldChange
- **RULE 8.2**: `SetCursorPos` only for cross-row/cross-record error targeting
- **RULE 9**: Surgical minimalism — no redundant `%Component` evaluates; consolidate conditions
- **Variable Harvesting**: Reuse existing variable names (`&rs`, `&row`, `&i`) from existing code
- **RULE 11**: Numeric fields must compare with `= 0`; `None()` is forbidden for numeric types
- Generated code is always a full merged block (never a diff) with `/*AI Injected*/` tags
