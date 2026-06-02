/**
 * eventClassifier.js
 * Classifies a natural-language PeopleCode requirement to a PS event.
 *
 * Strategy:
 *   1. Lowercase + normalise the requirement string.
 *   2. Score every event by counting how many of its keywords appear.
 *   3. Pick the highest-scoring event (ties broken by EVENT_PRIORITY order).
 *   4. Build targeted RAG search queries for the chosen event.
 *
 * Returns: { event, confidence, ragQueries[] }
 */

// ---------------------------------------------------------------------------
// Keyword map — exact phrases from design.md §6
// ---------------------------------------------------------------------------

const EVENT_KEYWORDS = {
  FieldEdit: ['validate', 'check', 'verify', 'invalid', 'must be', 'required'],
  FieldChange: ['when changed', 'recalculate', 'update', 'on change', 'field change',
    'click button', 'button click', 'press button', 'when clicked', 'transfer to'],
  SaveEdit: ['save validation', 'prevent save', 'validate on save', 'validate before save',
    'check on save', 'check before save', 'verify on save', 'error on save',
    'validate all lines', 'validate all rows', 'cross-field validation',
    'validate all', 'on save', 'before save'],
  SavePreChange: ['calculate on save', 'derive on save', 'update before write',
    'set field on save', 'modify on save', 'compute on save',
    'stamp on save', 'sequence on save'],
  SavePostChange: ['after save', 'post save', 'when saved'],
  RowInit: ['on load', 'initialize', 'page load', 'when opened',
    'gray out', 'grey out', 'make read-only', 'read only', 'protect field',
    'disable field', 'enable field', 'hide field', 'show field',
    'display only', 'make editable'],
  RowInsert: ['new row', 'when inserted', 'row added'],
  FieldDefault: ['default value', 'set default', 'initial value'],
  Activate: ['page security', 'page-specific', 'when page activates', 'on page load',
    'page-level security', 'tab change', 'navigate to page'],
  PreBuild: ['hide page', 'show page', 'before build', 'component variable'],
  PostBuild: ['after build', 'component load', 'after component loads'],
  SearchInit: ['search page', 'search default', 'search criteria', 'default search',
    'restrict search', 'pre-populate search', 'search record', 'search key'],
};

// Tiebreak order — more specific events win over generic ones
const EVENT_PRIORITY = [
  'FieldDefault',
  'FieldEdit',
  'FieldChange',
  'SaveEdit',
  'SavePreChange',
  'SavePostChange',
  'RowInsert',
  'RowInit',
  'Activate',
  'PreBuild',
  'PostBuild',
  'SearchInit',
];

// RAG query templates per event — each entry covers a different knowledge angle
const EVENT_RAG_QUERIES = {
  FieldEdit: [
    'FieldEdit validation event when fires restrictions',
    'Error Warning function syntax PeopleCode validation',
    'FieldEdit how to write validation code example',
  ],
  FieldChange: [
    'FieldChange event when fires component processor',
    'FieldChange recalculate update field value syntax',
    'SQLExec function syntax PeopleCode DB lookup',
  ],
  SaveEdit: [
    'SaveEdit cross-field cross-row validation event when fires',
    'Error Warning function syntax PeopleCode save validation',
    'SaveEdit ActiveRowCount loop rowset validate all rows PeopleCode',
  ],
  SavePreChange: [
    'SavePreChange event when fires data manipulation before SQL write',
    'SavePreChange derive calculate field values before save PeopleCode',
    'SavePreChange vs SaveEdit difference restrictions',
  ],
  SavePostChange: [
    'SavePostChange event after save fires',
    'SavePostChange post save processing PeopleCode',
    'SQLExec insert update after save example',
  ],
  RowInit: [
    'RowInit PostBuild event page load initialize',
    'RowInit default values initialize fields PeopleCode',
    'SetDefault GetField RowInit gray enable disable syntax',
  ],
  RowInsert: [
    'RowInsert event when fires new row added',
    'RowInsert initialize new row fields PeopleCode',
    'Rowset Row RowInsert class methods',
  ],
  FieldDefault: [
    'FieldDefault event default value PeopleCode',
    'FieldDefault set initial value syntax restrictions',
    'GetField SetDefault FieldDefault example',
  ],
  Activate: [
    'Activate event page-level PeopleCode when fires',
    'Activate page security role-based display PeopleCode',
    'Activate vs PostBuild vs PreBuild difference',
  ],
  PreBuild: [
    'PreBuild event hide show pages component PeopleCode',
    'PreBuild component variable initialization',
    'PreBuild vs PostBuild vs Activate difference',
  ],
  PostBuild: [
    'PostBuild event component-wide initialization PeopleCode',
    'PostBuild fires after RowInit component load',
    'PostBuild vs PreBuild vs Activate difference',
  ],
  SearchInit: [
    'SearchInit event search page PeopleCode when fires',
    'SearchInit default search criteria pre-populate keys',
    'SearchInit vs RowInit vs FieldDefault difference',
  ],
};

// ---------------------------------------------------------------------------
// Application Class detection
// ---------------------------------------------------------------------------
// Application Classes are NOT an event — they are an OOP construct invoked FROM
// an event. So we keep the normal event classification but, when class intent is
// detected, surface an extra RAG query so the generator gets App Class patterns
// in its "Class and Method Reference" context block.

const APP_CLASS_KEYWORDS = [
  'application class', 'app class', 'application package', 'app package',
  'object-oriented', 'object oriented',
  'create a class', 'create class', 'new class', 'use a class',
  'method', 'class method', 'instantiate', 'extends', 'implements',
  'interface', 'inherit', 'subclass', 'reusable class', 'oop',
];

const APP_CLASS_RAG_QUERY =
  'Application Class import class method property extends create instantiate PeopleCode';

/**
 * Detect whether a requirement calls for an Application Class implementation.
 * @param {string} requirement
 * @returns {boolean}
 */
function detectAppClass(requirement) {
  if (!requirement || !requirement.trim()) return false;
  const normalised = requirement.toLowerCase();
  return APP_CLASS_KEYWORDS.some((kw) => normalised.includes(kw));
}

// ---------------------------------------------------------------------------
// Confidence thresholds
// ---------------------------------------------------------------------------

const CONFIDENCE = {
  HIGH: 'high',     // ≥ 2 keyword hits
  MEDIUM: 'medium', // exactly 1 keyword hit
  LOW: 'low',       // fallback (no hits — default to FieldEdit)
};

// ---------------------------------------------------------------------------
// classify()
// ---------------------------------------------------------------------------

/**
 * Classify a natural-language requirement to a PeopleCode event.
 *
 * @param {string} requirement  Developer's free-text description
 * @returns {{ event: string, confidence: string, ragQueries: string[] }}
 */
function classify(requirement) {
  if (!requirement || !requirement.trim()) {
    return {
      event: 'FieldEdit',
      confidence: CONFIDENCE.LOW,
      ragQueries: EVENT_RAG_QUERIES.FieldEdit,
    };
  }

  const normalised = requirement.toLowerCase().trim();

  // Score each event.
  // Weight: each matching keyword contributes (number of words in that keyword)
  // so multi-word phrases like "after save" (2 pts) beat single words like
  // "update" (1 pt) — prevents generic words from overriding specific phrases.
  const scores = Object.entries(EVENT_KEYWORDS).map(([event, keywords]) => {
    const hits = keywords.filter((kw) => normalised.includes(kw));
    const score = hits.reduce((sum, kw) => sum + kw.split(/\s+/).length, 0);
    return { event, hits, score };
  });

  // Sort: highest total score first.
  // Tiebreak 1: longest single keyword match (more specific phrase wins).
  // Tiebreak 2: priority index (lower = higher priority).
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aMax = a.hits.length ? Math.max(...a.hits.map((kw) => kw.split(/\s+/).length)) : 0;
    const bMax = b.hits.length ? Math.max(...b.hits.map((kw) => kw.split(/\s+/).length)) : 0;
    if (bMax !== aMax) return bMax - aMax;
    return EVENT_PRIORITY.indexOf(a.event) - EVENT_PRIORITY.indexOf(b.event);
  });

  const best = scores[0];

  // Confidence based on weighted score:
  //   HIGH   → score ≥ 3  (e.g. two multi-word hits, or one + one single-word)
  //   MEDIUM → score 1–2  (at least one keyword matched)
  //   LOW    → score 0    (no keyword matched — fallback)
  let confidence;
  if (best.score >= 3) {
    confidence = CONFIDENCE.HIGH;
  } else if (best.score >= 1) {
    confidence = CONFIDENCE.MEDIUM;
  } else {
    confidence = CONFIDENCE.LOW;
  }

  const event = best.score > 0 ? best.event : 'FieldEdit';
  const ragQueries = buildRagQueries(event, requirement);

  // App Class is orthogonal to event choice — append its RAG query (merged into
  // classDocs downstream) so the generator gets OOP patterns when class intent
  // is present. The host event (FieldChange, SaveEdit, etc.) is still chosen above.
  const isAppClass = detectAppClass(requirement);
  if (isAppClass) ragQueries.push(APP_CLASS_RAG_QUERY);

  return { event, confidence, ragQueries, isAppClass };
}

// ---------------------------------------------------------------------------
// RAG query builder
// ---------------------------------------------------------------------------

/**
 * Build RAG queries for the classified event.
 * Always returns 3 queries:
 *   [0] Event classification / behaviour query
 *   [1] Function syntax query
 *   [2] Requirement-specific keyword query
 *
 * @param {string} event
 * @param {string} requirement  Original text — used to enrich query [2]
 * @returns {string[]}
 */
function buildRagQueries(event, requirement) {
  const base = EVENT_RAG_QUERIES[event] ?? EVENT_RAG_QUERIES.FieldEdit;

  // Third query: blend the event name with the most informative words from
  // the requirement (stop-words stripped) so RAG returns context-specific docs.
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
    'for', 'of', 'with', 'is', 'it', 'this', 'that', 'be', 'as', 'by',
    'are', 'was', 'were', 'has', 'have', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'from', 'into', 'when', 'how',
  ]);

  const keywords = requirement
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 5)
    .join(' ');

  const contextQuery = keywords
    ? `${event} PeopleCode ${keywords}`
    : base[2];

  return [base[0], base[1], contextQuery];
}

export { classify, detectAppClass, APP_CLASS_RAG_QUERY };
