/**
 * generate.js — frontend API client
 * Calls POST /api/generate (proxied by Vite → http://localhost:4000/generate)
 */

function getApiBase() {
  try {
    const stored = localStorage.getItem('sparky-api-url');
    if (stored && stored.trim()) return stored.trim();
  } catch {}
  return import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}` : '';
}

async function post(path, payload) {
  const apiBase = getApiBase();
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Cannot reach the PS Code Builder server. Is it running on port 4000?');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${response.status})`);
  }

  if (!response.ok || !body.success) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }

  return body;
}

/**
 * @param {{ componentName: string, market: string, requirement: string, action?: string, proposal?: string, contextId?: string }} payload
 */
export async function generateCode({ componentName, market, requirement, action = 'execute', proposal = null, contextId = null }) {
  return post('/api/generate', { componentName, market, requirement, action, proposal, contextId });
}

/**
 * Extract structured metadata from a pasted PeopleCode block (Haiku).
 * @param {{ pastedCode: string, requirement: string }} payload
 */
export async function parseCode({ pastedCode, requirement }) {
  return post('/api/parse', { pastedCode, requirement });
}

/**
 * Generate code in paste mode (no MCP — uses pasted code as context).
 * @param {{ pastedCode: string, eventHint: string, requirement: string, parsedContext: object, componentName?: string, action: 'paste-propose'|'paste-execute' }} payload
 */
export async function generatePasteCode({ pastedCode, eventHint, requirement, parsedContext, componentName, action }) {
  return post('/api/generate', { pastedCode, eventHint, requirement, parsedContext, componentName, action });
}
