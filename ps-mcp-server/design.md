# PeopleSoft MCP Server — Design Specification

> Agent 1 — The Planner  
> All downstream agents (2–5) must treat this document as the single source of truth.

---

## 1. Folder Structure

```
ps-mcp-server/
├── server.js                     # Express entry point — registers all tools on POST /call
├── db/
│   ├── config.js                 # runQuery() + mock mode detection
│   ├── mock.js                   # Static mock responses for each tool (getMock)
│   └── oracle.js                 # Oracle DB connection pool (node-oracledb)
├── tools/
│   ├── getComponentStructure.js
│   ├── getAllRecords.js
│   ├── getFieldsByRecord.js
│   ├── getPeopleCodeByEvent.js
│   └── getFunclibFunctions.js
├── queries/
│   └── sqls.md                   # Source SQL reference (do not import directly)
├── design.md                     # This file
├── requirement.md
├── package.json
└── .env.example                  # DB_USER, DB_PASSWORD, DB_CONNECT_STRING, USE_MOCK
```

**Rules for agents building these files:**
- One tool per file under `src/tools/`
- `src/db/query.ts` is the ONLY file that touches oracledb or mock data
- No tool file imports oracledb directly
- `src/index.ts` only registers tools — no business logic

---

## 2. Environment Configuration

`.env.example`:
```
DB_USER=
DB_PASSWORD=
DB_CONNECT_STRING=      # e.g. host:port/service
USE_MOCK=false          # set true to force mock mode
```

Connection pool is initialised once at startup. If `USE_MOCK=true` or the pool fails to initialise, all queries fall through to mock data automatically.

---

## 3. MCP Tool Specifications

### Tool 1 — `get_component_structure`

**SQL used:** SQL1 (Component Scroll Levels)  
**Bind params:** `:1` = `component_name`

**Input schema:**
```json
{
  "name": "get_component_structure",
  "description": "Returns all tables used in a PeopleSoft component and their scroll levels (0=level0/header, 1=grid, 2=subgrid, etc.)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "component_name": {
        "type": "string",
        "description": "PeopleSoft component name (PNLGRPNAME), e.g. JOB_DATA"
      }
    },
    "required": ["component_name"]
  }
}
```

**Output format:**
```json
{
  "component": "JOB_DATA",
  "source": "db",
  "scroll_levels": [
    { "table_name": "PERSONAL_DATA",  "scroll_level": 0 },
    { "table_name": "EMPLOYMENT",     "scroll_level": 0 },
    { "table_name": "JOB",            "scroll_level": 1 },
    { "table_name": "JOB_EARNS_DIST", "scroll_level": 2 }
  ]
}
```

`source` is `"db"` or `"mock"`.  
`scroll_level` is the integer value of `OCCURSLEVEL` (0 = header/level-0, 1 = first grid, 2 = sub-grid).

---

### Tool 2 — `get_all_records`

**SQL used:** SQL4 (All Records with Type Decoded)  
**Bind params:** `:1` = `component_name` (used twice in UNION)

> SQL2 is an alternative that returns only Table-type records. SQL4 is preferred because it returns all record types with the type decoded, giving AI richer context.

**Input schema:**
```json
{
  "name": "get_all_records",
  "description": "Returns every record (table, view, derived, etc.) referenced in a component, with record type decoded.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "component_name": {
        "type": "string",
        "description": "PeopleSoft component name (PNLGRPNAME)"
      }
    },
    "required": ["component_name"]
  }
}
```

**Output format:**
```json
{
  "component": "JOB_DATA",
  "source": "db",
  "records": [
    { "record_name": "PERSONAL_DATA",   "record_type": "Table" },
    { "record_name": "DERIVED_HR",      "record_type": "Derived" },
    { "record_name": "JOB_VW",          "record_type": "View" },
    { "record_name": "JOB_EARNS_DIST",  "record_type": "Table" }
  ]
}
```

Valid `record_type` values: `"Table"`, `"View"`, `"Derived"`, `"Sub Record"`, `"Dynamic View"`, `"Query View"`, `"Temporary Table"`, `"Unknown"`.

---

### Tool 3 — `get_fields_by_record`

**SQL used:** SQL5 (Record Fields with Keys)  
**Bind params:** `:1` = `record_name`

> This tool takes a **record name**, not a component name. Typical AI workflow: call `get_all_records` first, then call `get_fields_by_record` for each record of interest.

**Input schema:**
```json
{
  "name": "get_fields_by_record",
  "description": "Returns all fields of a PeopleSoft record with key flags, data types, and lengths.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "record_name": {
        "type": "string",
        "description": "PeopleSoft record name (RECNAME), e.g. JOB"
      }
    },
    "required": ["record_name"]
  }
}
```

**Output format:**
```json
{
  "record": "JOB",
  "source": "db",
  "fields": [
    {
      "field_num": 1,
      "field_name": "EMPLID",
      "field_label": "Employee ID",
      "field_type": 0,
      "length": 11,
      "is_key": true,
      "is_required": true,
      "is_search_key": true,
      "is_list_box": false
    },
    {
      "field_num": 4,
      "field_name": "MERCHANDISE_AMT",
      "field_label": "Merchandise Amount",
      "field_type": 3,
      "length": 26,
      "is_key": false,
      "is_required": false,
      "is_search_key": false,
      "is_list_box": false
    },
    {
      "field_num": 5,
      "field_name": "MERCH_AMT_BSE",
      "field_label": "Merchandise Amount (Base Currency)",
      "field_type": 3,
      "length": 26,
      "is_key": false,
      "is_required": false,
      "is_search_key": false,
      "is_list_box": false
    }
  ]
}
```

`field_label` is sourced from `DBMS_LOB.SUBSTR(PSDBFIELD.DESCRLONG, 256, 1)`. The AI uses this human-readable label for **semantic field matching** — e.g., matching the user's phrase "merchandise amount" to `MERCHANDISE_AMT` rather than `MERCH_AMT_BSE` (base currency equivalent). If `DESCRLONG` is empty, `field_name` is used as the fallback.

Boolean flags (`is_key`, `is_required`, `is_search_key`, `is_list_box`) are derived from the `USEEDIT` bitmask — convert the SQL `'Y'`/`' '` string to JSON `true`/`false` in the tool layer.

`field_type` integer meanings (PeopleSoft standard):
`0=Char`, `1=Long Char`, `2=Number`, `3=Signed Number`, `4=Date`, `5=Time`, `6=DateTime`, `8=Image/Attachment`

---

### Tool 4 — `get_peoplecode_by_event`

**SQL used:** SQL6a (field-level events) + SQL6b (record-wide events)  
**Bind params:** SQL6a: `:1` = `record_name`, `:2` = `field_name` | SQL6b: `:1` = `record_name`

**Input schema:**
```json
{
  "name": "get_peoplecode_by_event",
  "description": "Returns PeopleCode programs attached to a record. When field_name is provided, returns field_events (events on that specific field) and record_events (all events across the record). When field_name is omitted, field_events is empty.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "record_name": {
        "type": "string",
        "description": "PeopleSoft record name (RECNAME), e.g. JOB"
      },
      "field_name": {
        "type": "string",
        "description": "Target field name (FIELDNAME), e.g. MERCHANDISE_AMT. When provided, field_events will be scoped to this field only."
      }
    },
    "required": ["record_name"]
  }
}
```

**Output format:**
```json
{
  "record": "JOB",
  "source": "db",
  "field_name": "EFFDT",
  "field_events": [
    {
      "record_name": "JOB",
      "field_name": "EFFDT",
      "event_name": "FieldEdit",
      "code": "If %Panel = Panel.JOB_DATA1 Then ..."
    }
  ],
  "record_events": [
    {
      "record_name": "JOB",
      "field_name": "ACTION",
      "event_name": "FieldChange",
      "code": "..."
    },
    {
      "record_name": "JOB",
      "field_name": "EFFDT",
      "event_name": "SaveEdit",
      "code": "..."
    }
  ]
}
```

- `field_events` — all PeopleCode events directly on the target `field_name` (FieldEdit, FieldChange, FieldDefault, etc.). Empty array when `field_name` is not provided.
- `record_events` — all PeopleCode events for every field on the record (SavePreChange, SaveEdit, SavePostChange, RowInit, etc.). Always populated.

**CLOB Safety**: `PCTEXT` is a CLOB column. Raw `PCTEXT` access without LOB handling may silently truncate large programs.

**Two-query design**: Running SQL6a (field-scoped) and SQL6b (record-wide) in parallel gives the AI generator the complete picture of existing logic — both the exact target event to merge into, and all surrounding save/init events that may interact with it.

---

### Tool 5 — `get_funclib_functions`

**SQL used:** SQL7 (FUNCLIB Functions)  
**Bind params:** `:1` = `funclib_name`

> This tool takes a **FUNCLIB record name** (e.g. `FUNCLIB_HR`), not a component name.

**Input schema:**
```json
{
  "name": "get_funclib_functions",
  "description": "Returns all function definitions stored in a PeopleSoft FUNCLIB record.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "funclib_name": {
        "type": "string",
        "description": "FUNCLIB record name, must start with FUNCLIB, e.g. FUNCLIB_HR"
      }
    },
    "required": ["funclib_name"]
  }
}
```

**Output format:**
```json
{
  "funclib": "FUNCLIB_HR",
  "source": "db",
  "functions": [
    {
      "funclib_name": "FUNCLIB_HR",
      "field_name": "DERIVED_HR",
      "event_name": "FieldFormula",
      "code": "Function GetEmplName(&EMPLID As string) Returns string ..."
    }
  ]
}
```

---

## 4. Mock Data Strategy

**Location:** `src/mock/mockData.ts`

**Trigger conditions (either):**
1. `USE_MOCK=true` in `.env`
2. Oracle connection pool fails to initialise at startup (caught in `src/db/connection.ts`)

**Structure of `mockData.ts`:**
```typescript
// Keyed by tool name. Each tool handler calls getMock(toolName, input).
export const MOCK: Record<string, unknown> = {
  get_component_structure: { ... },   // one representative response
  get_all_records: { ... },
  get_fields_by_record: { ... },
  get_peoplecode_by_event: { ... },
  get_funclib_functions: { ... },
};
```

Mock responses must:
- Use realistic PeopleSoft field/record names (e.g. `JOB`, `PERSONAL_DATA`, `EMPLID`)
- Include `"source": "mock"` in the top-level object
- Match the exact output schema of the real tool — AI consumers must not be able to tell the difference structurally

Mock responses must NOT:
- Be empty arrays
- Use placeholder strings like `"field1"`, `"record1"`

**In `src/db/query.ts`:**
```typescript
export async function runQuery(sql: string, binds: unknown[], toolName: string): Promise<unknown[]> {
  if (isMockMode()) {
    return getMockRows(toolName);
  }
  // real oracledb execute
}
```

---

## 5. DB Connection Module (`src/db/connection.ts`)

- Initialise an `oracledb.createPool()` once on server start
- Export `getPool()` — throws if pool is not ready and mock mode is off
- On init failure: log the error, set an internal `mockModeActive = true` flag, continue
- Pool config: `poolMin: 1`, `poolMax: 5`, `poolIncrement: 1`

---

## 6. Server Entry Point (`src/index.ts`)

```typescript
import express from "express";
import cors from "cors";

// 1. Init DB pool (sets mock mode on failure)
// 2. Create Express app with CORS and JSON parsing (app.use(express.json()))
// 3. Mount Native Express endpoint (app.post('/call')) to dynamically invoke the 5 tools
// 4. Bypasses buggy @modelcontextprotocol/sdk constraints
// 5. Start Express app on PORT 3000
```

Tool invocation pattern inside `app.post('/call')`:
```typescript
app.post('/call', async (req, res) => {
  const { tool: toolName, params } = req.body;
  const tool = TOOLS.find(t => t.name === toolName);
  const result = await tool.handler(params);
  return res.json({ result });
});
```

---

## 7. Instructions for Agents 2–5

### Agent 2 — DB Layer Builder
Build `src/db/connection.ts` and `src/db/query.ts`.
- `connection.ts`: pool init, `getPool()`, mock flag export
- `query.ts`: `runQuery(sql, binds, toolName)` — real path calls `getPool().execute()`, mock path returns from `mockData.ts`
- Use `oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT` so rows are plain objects
- Do not build any tool files

### Agent 3 — Tool Builder (Tools 1 & 2)
Build `src/tools/getComponentStructure.ts` and `src/tools/getAllRecords.ts`.
- Import `runQuery` from `../db/query`
- Embed the exact SQL text from SQL1 / SQL4 as a `const` at the top of each file
- Map raw DB rows to the output schema defined in Section 3 above
- Export a single async function: `export async function getComponentStructure(componentName: string)`

### Agent 4 — Tool Builder (Tools 3, 4 & 5)
Build `src/tools/getFieldsByRecord.ts`, `src/tools/getPeopleCodeByEvent.ts`, `src/tools/getFunclibFunctions.ts`.
- Same pattern as Agent 3
- SQL5 binds one param, SQL6 binds one param, SQL7 binds one param
- For `getFieldsByRecord`: convert `'Y'`/`' '` strings from DB to boolean `true`/`false`

### Agent 5 — Server Wirer & Mock Data Author
1. Build `src/mock/mockData.ts` with realistic mock responses for all 5 tools
2. Build `src/types.ts` with TypeScript interfaces matching every output schema in Section 3
3. Build `src/index.ts` — import all 5 tool functions, register them with McpServer, wire SSEServerTransport inside an Express app.
4. Build `package.json` and `tsconfig.json`
   - Dependencies: `oracledb`, `dotenv`, `express`, `cors`
   - Dev: `typescript`, `@types/node`
   - Scripts: `"build": "tsc"`, `"start": "node dist/index.js"`, `"dev": "ts-node src/index.ts"`

---

## 8. Data Flow Summary

```
AI Client
   │
   │  MCP call: get_component_structure({ component_name: "JOB_DATA" })
   ▼
src/index.ts  (tool registry)
   │
   ▼
src/tools/getComponentStructure.ts
   │  calls runQuery(SQL1, ["JOB_DATA"], "get_component_structure")
   ▼
src/db/query.ts
   ├── mock mode? → src/mock/mockData.ts → return mock rows
   └── live mode? → src/db/connection.ts → oracledb.execute → return rows
   │
   ▼
getComponentStructure.ts  maps rows → JSON response
   │
   ▼
AI Client receives clean JSON
```

---

## 9. Error Handling Contract

All tool handlers must return errors as valid MCP content, never throw to the transport layer:

```json
{
  "component": "BAD_COMPONENT",
  "source": "db",
  "error": "ORA-00942: table or view does not exist",
  "scroll_levels": []
}
```

- Catch DB errors inside each tool function
- Log with `console.error` (these go to stderr, not MCP stdout)
- Return the empty array + `error` string — AI can reason about the failure

---

*End of design specification.*
