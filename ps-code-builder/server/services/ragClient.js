/**
 * ragClient.js
 * HTTP client for the RAG REST API (http://localhost:8000).
 * Primary knowledge source for PeopleCode docs, events, functions, classes.
 */

const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8000';
const RAG_PROJECT_DEFAULT = process.env.RAG_PROJECT || 'peoplesoft';

/**
 * Search the RAG knowledge base.
 *
 * @param {string} query    Natural language or keyword search string
 * @param {string} [project] RAG project/collection to search (defaults to RAG_PROJECT env)
 * @param {number} [limit]   Max number of results to return (default 5)
 * @returns {Promise<Array<{id: string, content: string, score: number, metadata: object}>>}
 */
async function search(query, project = RAG_PROJECT_DEFAULT, limit = 5) {
  if (!query || !query.trim()) {
    console.error('[ragClient] search() called with empty query');
    return [];
  }

  const params = new URLSearchParams({
    q: query.trim(),
    project,
    limit: String(limit),
  });

  const url = `${RAG_API_URL}/search?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (networkErr) {
    console.error(`[ragClient] Network error searching RAG for "${query}":`, networkErr.message);
    throw new Error(`RAG API unreachable: ${networkErr.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    console.error(`[ragClient] RAG search returned HTTP ${response.status}: ${text}`);
    throw new Error(`RAG API error ${response.status}: ${text}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (parseErr) {
    console.error('[ragClient] Failed to parse RAG JSON response:', parseErr.message);
    throw new Error('RAG API returned invalid JSON');
  }

  // Normalise: accept { results: [...] } envelope or bare array
  const results = Array.isArray(body) ? body : (body?.results ?? []);
  return results;
}

export { search };
