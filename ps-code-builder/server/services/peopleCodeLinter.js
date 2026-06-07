/**
 * peopleCodeLinter.js
 * Post-generation validation/linting pass for generated PeopleCode.
 *
 * This is a lightweight, dependency-free static checker that runs AFTER the LLM
 * produces a code block. Its job is to catch the most common LLM hallucinations
 * and structural mistakes BEFORE the developer copies the code into App Designer:
 *
 *   1. Unbalanced block constructs (If/End-If, For/End-For, Evaluate/End-Evaluate, …)
 *   2. Error/Warning statements in events where they are invalid or discouraged
 *   3. Variables that are used (&var) but never declared in the block
 *   4. Field references on the target record that don't exist in the metadata
 *
 * PeopleCode is not parsed into a full AST — these are pragmatic heuristics tuned
 * to stay quiet on valid code (low false-positive rate) while flagging clear
 * problems. Findings are advisory: they are returned alongside the code, never
 * block generation.
 *
 * Severities: 'error' (almost certainly wrong) | 'warning' (likely wrong /
 * discouraged) | 'info' (worth a look, may be a false positive).
 */

// ---------------------------------------------------------------------------
// Event rules for Error / Warning placement
// ---------------------------------------------------------------------------

// Events where Error/Warning are the correct, supported mechanism.
const ERROR_WARNING_OK_EVENTS = new Set([
  'saveedit', 'fieldedit', 'rowdelete', 'searchsave',
]);

// Events where an Error/Warning is a real bug — these events cannot meaningfully
// reject input; an Error here aborts processing in a way that confuses users or
// is silently swallowed.
const ERROR_WARNING_FORBIDDEN_EVENTS = new Set([
  'rowinit', 'rowinsert', 'rowselect', 'fielddefault', 'fieldformula',
  'savepostchange', 'activate', 'prebuild', 'postbuild', 'searchinit',
  'prepopup', 'itemselected',
]);
// (SavePreChange / FieldChange are "discouraged" — handled as the default
//  warning branch below rather than listed here.)

// ---------------------------------------------------------------------------
// Block constructs: open keyword → matching close keyword
// ---------------------------------------------------------------------------

const BLOCK_PAIRS = [
  { name: 'If',       open: /(?<!-)\bIf\b/gi,        close: /\bEnd-If\b/gi },
  { name: 'For',      open: /(?<!-)\bFor\b/gi,       close: /\bEnd-For\b/gi },
  { name: 'While',    open: /(?<!-)\bWhile\b/gi,     close: /\bEnd-While\b/gi },
  { name: 'Evaluate', open: /(?<!-)\bEvaluate\b/gi,  close: /\bEnd-Evaluate\b/gi },
  { name: 'try',      open: /(?<!-)\btry\b/gi,       close: /\bend-try\b/gi },
  { name: 'Function', open: /(?<!-)\bFunction\b/gi,  close: /\bEnd-Function\b/gi },
  { name: 'method',   open: /(?<!-)\bmethod\b/gi,    close: /\bend-method\b/gi },
  { name: 'class',    open: /(?<!-)\bclass\b/gi,     close: /\bend-class\b/gi },
];

// ---------------------------------------------------------------------------
// Noise stripping — remove block comments and string literals so keyword/token
// scans never trip on text inside them. Newlines are preserved so that line
// numbers stay accurate.
// ---------------------------------------------------------------------------

function blankPreservingNewlines(match) {
  return match.replace(/[^\n]/g, ' ');
}

function stripNoise(code) {
  let out = code;
  // Block comments /* ... */ (PeopleCode has no // line comments)
  out = out.replace(/\/\*[\s\S]*?\*\//g, blankPreservingNewlines);
  // REM ... ; comments (rem to end of statement)
  out = out.replace(/\brem\b[^;\n]*/gi, blankPreservingNewlines);
  // Double-quoted strings; PeopleCode escapes a quote by doubling it ("")
  out = out.replace(/"(?:[^"]|"")*"/g, blankPreservingNewlines);
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Collect names (lower-cased, without the &) declared in the block. */
function collectDeclaredVars(clean) {
  const declared = new Set();

  // Local / Global / Component / Constant declarations — capture every &name in
  // the statement (handles `Local number &a, &b = 0;`).
  const declRe = /\b(?:Local|Global|Component|Constant)\b([^;]*);/gi;
  let m;
  while ((m = declRe.exec(clean)) !== null) {
    const names = m[1].match(/&[A-Za-z0-9_]+/g) || [];
    names.forEach((n) => declared.add(n.slice(1).toLowerCase()));
  }

  // For loop iterators: `For &i = 1 To ...`
  const forRe = /\bFor\s+(&[A-Za-z0-9_]+)/gi;
  while ((m = forRe.exec(clean)) !== null) {
    declared.add(m[1].slice(1).toLowerCase());
  }

  // Function / method parameter lists: `Function foo(&a, &b)` and method headers
  const paramRe = /\b(?:Function|method)\s+[A-Za-z0-9_]+\s*\(([^)]*)\)/gi;
  while ((m = paramRe.exec(clean)) !== null) {
    const names = m[1].match(/&[A-Za-z0-9_]+/g) || [];
    names.forEach((n) => declared.add(n.slice(1).toLowerCase()));
  }

  // Method signature annotations: `/+ &x as Type +/` — already stripped as block
  // comments, so also scan the raw form before stripping (handled by caller).

  // catch Exception &ex
  const catchRe = /\bcatch\b[^&\n]*(&[A-Za-z0-9_]+)/gi;
  while ((m = catchRe.exec(clean)) !== null) {
    declared.add(m[1].slice(1).toLowerCase());
  }

  return declared;
}

/** Pull declared params out of /+ ... +/ signature annotations (pre-strip). */
function collectSignatureVars(rawCode) {
  const declared = new Set();
  const sigRe = /\/\+([^]*?)\+\//g;
  let m;
  while ((m = sigRe.exec(rawCode)) !== null) {
    const names = m[1].match(/&[A-Za-z0-9_]+/g) || [];
    names.forEach((n) => declared.add(n.slice(1).toLowerCase()));
  }
  return declared;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkBlockBalance(clean, findings) {
  for (const pair of BLOCK_PAIRS) {
    const opens  = countMatches(clean, pair.open);
    const closes = countMatches(clean, pair.close);
    if (opens !== closes) {
      findings.push({
        severity: 'error',
        rule: 'unbalanced-block',
        line: null,
        message: `Unbalanced ${pair.name} block: ${opens} "${pair.name}" vs ${closes} matching close keyword(s). Every ${pair.name} must have a matching End-${pair.name === 'try' ? 'try' : pair.name}.`,
      });
    }
  }
}

function checkErrorWarningPlacement(clean, event, findings) {
  if (!event) return;
  const ev = String(event).trim().toLowerCase();
  if (ERROR_WARNING_OK_EVENTS.has(ev)) return; // correct usage, nothing to flag

  const re = /(?<!-)\b(Error|Warning)\b\s*(?=["&]|Msg|[A-Za-z])/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const kw = m[1];
    const forbidden = ERROR_WARNING_FORBIDDEN_EVENTS.has(ev);
    findings.push({
      severity: forbidden ? 'error' : 'warning',
      rule: 'error-warning-placement',
      line: lineOf(clean, m.index),
      message: forbidden
        ? `${kw} statement is invalid in the ${event} event — it cannot reject input here. Move validation to SaveEdit or FieldEdit.`
        : `${kw} statement in ${event} is discouraged — ${event} is for data manipulation, not validation. Prefer SaveEdit/FieldEdit for ${kw}.`,
    });
  }
}

function checkUndeclaredVars(rawCode, clean, findings) {
  const declared = collectDeclaredVars(clean);
  collectSignatureVars(rawCode).forEach((v) => declared.add(v));

  const seen = new Set();
  const useRe = /&[A-Za-z0-9_]+/g;
  let m;
  while ((m = useRe.exec(clean)) !== null) {
    const name = m[0].slice(1).toLowerCase();
    if (declared.has(name) || seen.has(name)) continue;
    seen.add(name);
    findings.push({
      severity: 'info',
      rule: 'undeclared-variable',
      line: lineOf(clean, m.index),
      message: `Variable &${m[0].slice(1)} is used but no declaration was found in this block. If it is harvested from existing code this is fine; otherwise add a Local/Component declaration.`,
    });
  }
}

function checkUnknownFields(clean, targetRecord, knownFields, findings) {
  if (!targetRecord || !knownFields || knownFields.length === 0) return;
  const recU = String(targetRecord).toUpperCase();
  const fieldSet = new Set(knownFields.map((f) => String(f).toUpperCase()));

  // RECORD.FIELD.<Property|Method> — only validate refs to the target record so
  // sibling/related records (whose fields we don't have) don't false-positive.
  const refRe = /\b([A-Z][A-Z0-9_]+)\.([A-Z][A-Z0-9_]+)\.(?:Value|SetDefault|Visible|Enabled|DisplayOnly|Label|SetCursorPos)\b/g;
  const flagged = new Set();
  let m;
  while ((m = refRe.exec(clean)) !== null) {
    const [, rec, field] = m;
    if (rec.toUpperCase() !== recU) continue;
    if (fieldSet.has(field.toUpperCase())) continue;
    if (flagged.has(field.toUpperCase())) continue;
    flagged.add(field.toUpperCase());
    findings.push({
      severity: 'warning',
      rule: 'unknown-field',
      line: lineOf(clean, m.index),
      message: `Field ${rec}.${field} is not in the metadata for record ${recU}. Verify the field name (possible hallucination or typo).`,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lint a generated PeopleCode block.
 *
 * @param {string} code                 The generated PeopleCode.
 * @param {object} [opts]
 * @param {string} [opts.event]         Resolved event name (e.g. "SaveEdit").
 * @param {string} [opts.targetRecord]  Record the unit targets (for field checks).
 * @param {string[]} [opts.knownFields] Uppercase field names of the target record.
 * @returns {{ findings: Array<{severity:string,rule:string,line:number|null,message:string}>,
 *             summary: { errors:number, warnings:number, info:number, total:number } }}
 */
export function lintPeopleCode(code, opts = {}) {
  const empty = { findings: [], summary: { errors: 0, warnings: 0, info: 0, total: 0 } };
  if (!code || typeof code !== 'string' || !code.trim()) return empty;
  // Skip generation-failure placeholders.
  if (code.trim().startsWith('/* Code generation failed')) return empty;

  const { event = '', targetRecord = '', knownFields = [] } = opts;
  const clean = stripNoise(code);
  const findings = [];

  try {
    checkBlockBalance(clean, findings);
    checkErrorWarningPlacement(clean, event, findings);
    checkUndeclaredVars(code, clean, findings);
    checkUnknownFields(clean, targetRecord, knownFields, findings);
  } catch (err) {
    // The linter must never break generation — swallow and report nothing.
    console.error('[peopleCodeLinter] check failed:', err.message);
    return empty;
  }

  const summary = {
    errors:   findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    info:     findings.filter((f) => f.severity === 'info').length,
    total:    findings.length,
  };
  return { findings, summary };
}

export default { lintPeopleCode };
