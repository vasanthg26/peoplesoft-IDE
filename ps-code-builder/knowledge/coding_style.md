# PeopleCode Coding Style Guide (ANTIGRAVITY SENIOR ARCHITECT Standard)

> This guide defines the AI standard for all generated PeopleCode in Sparky.
> It enforces architectural integrity, minimalist footprints, and surgical variable harvesting.

## 1. MANDATORY CODING STANDARDS (PT 8.59+)
- **Syntax**: Use **lowercase** for all keywords (`if`, `then`, `else`, `end-if`, `local`, `for`, `end-for`).
- **Casing**: Use **PascalCase** for PeopleSoft Objects (Records, Fields, Components) and **Strong Typing** for variables (`Local Rowset &rs`).
- **Error Handling**: Use Message Catalog exclusively `Error MsgGet(set, num, "Default text");`. NEVER use hardcoded strings.
- **Surgical Minimalism**: Generate the absolute minimum lines of code. Purge all "visual polish".

---

## 2. BUFFER INTELLIGENCE & TRAVERSAL
### Object Anchoring Rule
Level 1+ Rowsets MUST be retrieved from the Parent Row Object anchor (`&rowL1.GetRowset(Scroll.CHILD)`) to maintain row context. avoid `GetLevel0().GetRowset(Scroll.REC)`.

### Nested Buffer Traversal Pattern (L1 -> L2)
/* Example of architectural alignment */
Local Rowset &rsLevel1, &rsLevel2;
Local Row &rowL1;
Local integer &i, &j;

&rsLevel1 = GetLevel0()(1).GetRowset(Scroll.PO_LINE);

for &i = 1 to &rsLevel1.ActiveRowCount
   &rowL1 = &rsLevel1.GetRow(&i);
   &rsLevel2 = &rowL1.GetRowset(Scroll.PO_LINE_DISTRIB);
   
   for &j = 1 to &rsLevel2.ActiveRowCount
      if &rsLevel2(&j).PO_LINE_DISTRIB.QTY_LN_ACCPT.Value > 0 then
         /* Minimalist logic here */
      end-if;
   end-for; 
end-for; 

---

## 3. ARCHITECTURAL LAWS

### RULE 8.1 (PROXIMITY AUDIT)
If the validation logic is on the same Record.Field being edited, you are **FORBIDDEN** from using `SetCursorPos` or `%Component` evaluations. PeopleTools handles focus natively.

### RULE 8.2 (CONTEXTUAL GAP)
Only include `SetCursorPos` if the error is detected on a row or record different from the user's current focus:
- **Scenario A (Cross-Row)**: A SaveEdit loop on Level 1 hits an error on Row 5 while the user is on Row 1.
- **Scenario B (Cross-Record)**: A Header validation fails due to a missing value in a Grid.

### RULE 9 (SURGICAL MINIMALISM)
Treat code verbosity as a technical failure. 
- **No %Component evaluate** blocks unless essentially required for page navigation.
- **Consolidate Conditions**: Use `if A and B and C then` instead of nested `if` blocks.

### RULE 11 (TYPE-AWARE VALIDATION)
For fields identified as Numeric (Number, Signed Number), you MUST compare against `0` (e.g., `&amt = 0` or `&amt <> 0`). NEVER use `None()` or `All()` for numeric zero-checks; those are reserved for strings and objects.

### RULE 12 (SURGICAL BATCHING)
For records with >10 event blocks, you MUST perform an "Inventory Scan" batch call to identify relevant code. **FORBIDDEN**: Sequential per-event LLM calls during context gathering.

---

## 4. PHASED OPERATION PROTOCOL

### STAGE 0: TECHNICAL TRIAGE (AUTO)
Haiku scans all metadata and existing Code blocks in a single, batched **Surgical Audit** to prune irrelevant files before Phase 1.

### PHASE 1: TECHNICAL PROPOSAL
Before generation, provide a unified technical proposal explaining:
1. **BUSINESS INTENT**: How the requirement interacts with delivered logic.
2. **CONDITION CONSOLIDATION**: Mandatory single-line pseudocode.
3. **TECHNICAL STRUCTURE**: Identify Scroll Levels and existing Rowset variables.
4. **VARIABLE HARVEST PLAN**: Identify existing variables (e.g., &rs, &i) to prevent redefinition.

### PHASE 2: CODE SNIPPET FORMAT
/*AI Injected Code - Start*/
[Minimalist Merged Code]
/*AI Injected Code - End*/

---

## 5. MANDATORY VARIABLE HARVESTING
You must act as a "Surgical Integrator" that prioritizes existing variable nomenclature.
- **ACTION**: If the `existingCode` in context is truncated, you MUST call `get_peoplecode_by_event`.
- **HARVEST**: Identify if a Rowset for the current level is already instantiated (e.g., `&rs_lines`). Use that name instead of a fresh declaration.
