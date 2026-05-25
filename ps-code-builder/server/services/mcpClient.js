/**
 * mcpClient.js
 * HTTP client for ps-mcp-server (http://localhost:3000).
 * All tools are called via REST POST /call with a JSON body.
 * This completely circumvents buggy Zod dependencies.
 */

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

/**
 * Low-level helper — calls a single ps-mcp-server tool by name.
 * @param {string} toolName
 * @param {Record<string, unknown>} params
 * @returns {Promise<unknown>} Parsed result from the tool response
 */
async function callTool(toolName, params = {}) {
  const url = `${MCP_SERVER_URL}/call`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, params }),
    });
  } catch (networkErr) {
    console.error(`[mcpClient] Network error calling tool "${toolName}":`, networkErr.message);
    throw new Error(`ps-mcp-server unreachable: ${networkErr.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    console.error(`[mcpClient] Tool "${toolName}" returned HTTP ${response.status}: ${text}`);
    throw new Error(`ps-mcp-server error ${response.status} for tool "${toolName}": ${text}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (parseErr) {
    console.error(`[mcpClient] Failed to parse JSON from tool "${toolName}":`, parseErr.message);
    throw new Error(`ps-mcp-server returned invalid JSON for tool "${toolName}"`);
  }

  // Envelope: { result: ... } 
  return body?.result !== undefined ? body.result : body;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the structure of a PeopleSoft component.
 * @param {string} componentName  e.g. "PURCHASE_ORDER"
 * @param {string} market         e.g. "GBL"
 * @returns {Promise<unknown>}
 */
async function getComponentStructure(componentName, market = 'GBL') {
  return callTool('get_component_structure', { component_name: componentName, market });
}

/**
 * Get all records (and their types) associated with a component.
 * @param {string} componentName
 * @returns {Promise<unknown>}
 */
async function getAllRecords(componentName) {
  return callTool('get_all_records', { component_name: componentName });
}

/**
 * Get fields for a specific record.
 * @param {string} recordName  e.g. "PO_HDR"
 * @returns {Promise<unknown>}
 */
async function getFieldsByRecord(recordName) {
  return callTool('get_fields_by_record', { record_name: recordName });
}

/**
 * Get existing PeopleCode for a specific event on a record/field.
 * @param {string} recordName  e.g. "PO_HDR"
 * @param {string} fieldName   e.g. "VENDOR_ID"
 * @param {string} eventName   e.g. "FieldChange"
 * @returns {Promise<unknown>}
 */
async function getPeopleCodeByEvent(recordName, fieldName, eventName) {
  return callTool('get_peoplecode_by_event', {
    record_name: recordName,
    field_name: fieldName,
    event_name: eventName,
  });
}

/**
 * Get function definitions from a PeopleCode function library.
 * @param {string} funclibName  e.g. "FUNCLIB_PO"
 * @returns {Promise<unknown>}
 */
async function getFunclibFunctions(funclibName) {
  return callTool('get_funclib_functions', { funclib_name: funclibName });
}

export {
  getComponentStructure,
  getAllRecords,
  getFieldsByRecord,
  getPeopleCodeByEvent,
  getFunclibFunctions,
};
