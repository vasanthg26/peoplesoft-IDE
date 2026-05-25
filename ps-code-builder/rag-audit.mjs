/**
 * rag-audit.mjs
 * One-shot script to test RAG coverage for PeopleCode event topics.
 * Run: node rag-audit.mjs
 * Delete after use.
 */

const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000';
const PROJECT     = process.env.RAG_PROJECT  || 'peoplesoft';

const QUERIES = [
  // Event placement
  'FieldEdit validation PeopleCode when to use',
  'FieldChange event button press PeopleCode',
  'FieldDefault conditional default PeopleCode',
  'RowInit initialize field display gray PeopleCode',
  'RowInsert new row default values PeopleCode',
  'RowDelete prevent delete validation PeopleCode',
  'SaveEdit save validation error message PeopleCode',
  'SavePreChange update fields before save PeopleCode',
  'SavePostChange after save SQL update PeopleCode',
  'PreBuild PostBuild component event PeopleCode',
  'SearchInit SearchSave search page PeopleCode',
  // Event order / flow
  'PeopleCode event execution order flow Panel Processor',
];

async function query(q) {
  const url = `${RAG_API_URL}/search?q=${encodeURIComponent(q)}&project=${PROJECT}&limit=2`;
  try {
    const res  = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    const results = Array.isArray(body) ? body : (body?.results ?? []);
    return results;
  } catch (err) {
    return [{ error: err.message }];
  }
}

const SEPARATOR = '─'.repeat(72);

for (const q of QUERIES) {
  console.log(`\n${SEPARATOR}`);
  console.log(`QUERY: ${q}`);
  console.log(SEPARATOR);

  const results = await query(q);

  if (!results.length) {
    console.log('  ⚠️  NO RESULTS');
    continue;
  }

  results.forEach((r, i) => {
    if (r.error) { console.log(`  ❌ Error: ${r.error}`); return; }
    const score   = r.score != null ? ` [score: ${r.score.toFixed(3)}]` : '';
    const title   = r?.metadata?.title ?? r?.id ?? `Result ${i + 1}`;
    const content = (r?.content ?? r?.text ?? '').slice(0, 400);
    console.log(`\n  [${i + 1}] ${title}${score}`);
    console.log(`  ${content.replace(/\n/g, '\n  ')}`);
  });
}

console.log(`\n${SEPARATOR}`);
console.log('Audit complete.');
