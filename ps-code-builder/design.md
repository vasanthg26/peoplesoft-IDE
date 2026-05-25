# Sparky — Design Specification (Antigravity Standard)

> **Identity**: ANTIGRAVITY SENIOR PEOPLESOFT ARCHITECT
> **Role**: Specialized AI agent for surgical PeopleCode injection.
> All downstream agents must treat this as the single source of truth.

---

## 1. Purpose

Sparky is a high-fidelity PeopleCode generation workspace that transforms natural language requirements into architecturally-sound, surgical code injections. It follows a **Review-Confirm-Execute** protocol to ensure developer trust and object integrity.

---

## 2. Global Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express + WS (WebSockets) |
| **Frontend** | React + Apple Design System (Inter/Outfit) |
| **Theme Engine** | Dark / Light Mode (Dynamic CSS Variables) |
| **PS Metadata** | ps-mcp-server (Local Oracle DB Connectivity) |
| **PS Documentation** | RAG REST API (PT 8.59+ Knowledge Base) |
| **Core Intelligence** | Anthropic Claude (`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`) |

---

### Step 1: Technical Triage (The Decomposer)
1. **The Decomposer Agent** (Haiku) breaks the raw requirement into "Atomic Technical Units" (Record + Event + Intent).
2. Performs **Surgical Batching**: Scans all existing PeopleCode events in a single inventory call to prune irrelevant code.
3. Performs **Metadata Compaction** to optimize token usage.

### Phase 1: Technical Proposal (Propose)
1. **The Analyst Agent** (Sonnet) performs a "Surgical Audit" of the component structure and data types (Numeric/String).
2. Resolves conceptual "Status" requirements to technical table fields.
3. Generates a **Technical Proposal** presented in the Left Pane.

### Phase 2: Surgical Generation (Execute)
1. Upon confirmation, **The Generation Agent** (Sonnet) applies the Architectural Laws.
2. Performs **Variable Harvesting** to ensure existing Rowsets/Indices are reused.
3. Returns 100% complete, merged PeopleCode blocks with `/*AI Injected*/` tags.

---

## 4. Architectural Laws

Sparky is governed by these strict constraints to ensure minimal footprint:

1. **RULE 8.1 (Proximity Audit)**: No `SetCursorPos` if validation is on the same field/row in FieldEdit/FieldChange.
2. **RULE 8.2 (Contextual Gap)**: `SetCursorPos` is only permitted for cross-row or cross-record error targeting.
3. **RULE 9 (Surgical Minimalism)**: Omit all redundant `%Component` evaluates or visual polish. Consolidate conditions into single lines.
4. **Variable Harvesting**: Mandatory reuse of existing variable names (&rs, &row, &i) to prevent redefinition errors.
5. **RULE 11 (Type-Aware Validation)**: Mandatory compare-against-zero (`= 0`) for numeric fields; `None()` is strictly forbidden for numeric types.

---

## 5. UI Architecture (Apple Pro IDE)

The interface follows a high-fidelity "IDE" layout optimized for side-by-side context.

### 5.1 Dual-Pane Workspace
- **Right Pane (Interaction)**: Houses the Requirement prompt, Component search, Generate button, and Agent Explanations.
- **Left Pane (Review)**: The primary diagnostic area for Technical Proposals and final Code Outputs.

### 5.2 Dynamic Theme Engine
- Supports **Apple Light Mode** (white-frosted glass) and **Apple Dark Mode** (obsidian-frosted glass).
- Dynamic syntax color palettes based on current theme state.

### 5.3 Real-Time Intelligence Trace
- The Left Pane switches to **TracePanel** mode during all `loading` states.
- Streams live JSON packets via WebSockets (`notifier.js`) to show "Agent WIP".
- Provides transparency into RAG searches, metadata harvesting, and analysis logs.

---

## 6. Backend Folder Structure

```
ps-code-builder/
  server/
    services/
      notifier.js          ← WebSocket broadcast utility [NEW]
      analysisAgent.js     ← Generates Phase 1 Proposal
      codeGenerator.js     ← Generates Phase 2 Final Code
      llm/
        prompts/
          analysis.js      ← Senior Architect Persona (Rule 11)
          generate.js      ← Architectural Laws (8.1/8.2/9)
    routes/
      generate.js          ← POST /generate (Orchestrates WS notifications)
  client/
    src/
      App.jsx              ← IDE Layout + WS Connection Logic
      components/
        TracePanel.jsx     ← Live Agent Trace UI [NEW]
        ProposalView.jsx   ← Phase 1 Review UI
        CodeOutput.jsx     ← Phase 2 Review UI
  knowledge/
    coding_style.md        ← The Antigravity Style Standard
```

---

## 7. Operational Standards

### Syntax
- Keywords: **lowercase** (`if`, `then`, `end-if`).
- Objects: **PascalCase** (`PO_HDR.VENDOR_ID`).
- Logic: **Strong Typing** is mandatory.

### Object Anchoring
Level 1+ Rowsets MUST be retrieved from Parent Row Objects (`&rowParent.GetRowset`) to maintain transactional context.

### Merging Strategy
1. Adopt existing variables.
2. Merge Local declarations to the top block.
3. Never delete delivered code; only comment out if a contradiction exists.
