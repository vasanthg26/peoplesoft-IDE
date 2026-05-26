/**
 * prompts/analysis.js
 * Prompts for the Analysis Agent to generate a unified technical proposal.
 */

const SYSTEM_PROMPT = `# ROLE: ANTIGRAVITY SENIOR PEOPLESOFT ARCHITECT
You are a specialized AI agent designed to perform surgical code injections into complex, delivered PeopleSoft objects. You prioritize architectural integrity, minimalist footprints, and existing variable nomenclature over generic templates.

You are performing "PHASE 1: TECHNICAL PROPOSAL (MANDATORY)".
Your task is to analyze the environment and provide a technical strategy before any code is generated.

## ARCHITECTURAL ANALYST RULES:
1. **STATUS DISCOVERY (CRITICAL)**: If a requirement mentions "Status" (e.g., "Line Status", "Header Status"), you MUST resolve this conceptual term to a technical field using the field_label metadata (e.g., mapping "Line Status" to \`PO_STATUS\` or \`CANCEL_STATUS\` based on the label). When TRANSLATE VALUES are provided for a field, use the exact coded values (e.g., "A" not "Approved") and document the mapping in your proposal.
2. **TYPE DETERMINATION**: You MUST identify the data type (Numeric, String, Date) for every field mentioned in the requirement. This informs the subsequent generation's syntax.
3. **BE SURGICAL**: Focus on how new logic integrates with existing variables and rowsets.
4. **IDENTIFY VARIABLES**: Explicitly mention if you will reuse existing variables (like &rs, &i).
5. **FORMAT**: Return ONLY markdown using the specific Phase 1 headers.`;

/**
 * Build the user prompt for the analysis phase.
 * 
 * @param {string} requirement - Full requirement text
 * @param {object} context - Gathered context for all units
 */
function buildUserPrompt(requirement, context) {
  const { componentStructure, unitsContext } = context;

  const contextBlocks = unitsContext.map((ctx, idx) => {
    return `--- Unit ${idx + 1}: ${ctx.targetRecord}.${ctx.targetField || '(rec)'}.${ctx.event} ---
# EXISTING CODE:
${ctx.existingCode ? JSON.stringify(ctx.existingCode, null, 2) : '(None found)'}
# FIELD METADATA:
${ctx.keyFields ? JSON.stringify(ctx.keyFields.fields || ctx.keyFields, null, 2) : 'N/A'}`;
  }).join('\n\n');

  return `Component: ${componentStructure?.component_name || 'UNKNOWN'}
Business Requirement:
${requirement}

Context from relevant PeopleCode events:
${contextBlocks}

Based on the requirement and the existing code provided above, please provide a **TECHNICAL PROPOSAL**.

Follow this structure exactly:

### 1. BUSINESS INTENT
Analyze and explain how the requirement interacts with delivered logic (e.g., bypassing CANCEL_STATUS = 'X').
Explain what the existing code is trying to accomplish (the "what and why").

### 2. TECHNICAL STRUCTURE & TYPE AUDIT
- Identify the Scroll Levels (L0, L1, L2) and key Rowset/Row variables currently in use.
- **Field Resolution**: List the technical field names resolved from user concepts (e.g., "Line Status" -> \`PO_LINE.PO_STATUS\`).
- **Data Type Check**: Explicitly state the data type for each target field (e.g., \`MERCHANDISE_AMT\` is **Numeric**).
- Identify existing guards (e.g., If Not IsModal()).

### 3. VARIABLE HARVEST PLAN
Identify specific variables (e.g., &line, &rs, &i) already in scope to prevent "Variable Redefinition" errors. 
Detail exactly how you will integrate the new logic into these existing structures.

Return ONLY the markdown response.`;
}

export { SYSTEM_PROMPT, buildUserPrompt };
