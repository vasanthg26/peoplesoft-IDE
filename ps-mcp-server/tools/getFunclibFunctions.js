'use strict';

// SQL7 — FUNCLIB Functions
// Returns all function definitions stored in a FUNCLIB record.
// FUNCLIB records store reusable PeopleCode functions in FieldFormula events.
// The OBJECTVALUE1 LIKE 'FUNCLIB%' guard in SQL ensures only FUNCLIB records
// are queried even if the caller passes a non-FUNCLIB name.
// Bind: :1 = FUNCLIB record name (OBJECTVALUE1)
const SQL = `
SELECT OBJECTVALUE1  AS FUNCLIB_NAME,
       OBJECTVALUE2  AS FIELD_NAME,
       OBJECTVALUE3  AS EVENT_NAME,
       PCTEXT        AS PEOPLECODE
FROM   PSPCMTXT
WHERE  OBJECTID1 = 1
AND    OBJECTVALUE1 LIKE 'FUNCLIB%'
AND    OBJECTVALUE1 = :1
ORDER  BY OBJECTVALUE2
`.trim();

const { runQuery } = require('../db/config');

const name = 'get_funclib_functions';

const description =
  'Returns all PeopleCode function definitions stored in a PeopleSoft FUNCLIB ' +
  'record. FUNCLIB records are libraries of reusable functions shared across ' +
  'components. The funclib_name must start with FUNCLIB (e.g. FUNCLIB_PO, FUNCLIB_HR).';

const inputSchema = {
  type: 'object',
  properties: {
    funclib_name: {
      type:        'string',
      description: 'FUNCLIB record name — must start with FUNCLIB, e.g. FUNCLIB_PO',
      pattern:     '^FUNCLIB',
    },
  },
  required: ['funclib_name'],
};

/**
 * @param {{ funclib_name: string }} params
 * @returns {Promise<object>}
 */
async function handler({ funclib_name }) {
  const base = { funclib: funclib_name, source: 'db' };

  // Guard: reject names that don't start with FUNCLIB before hitting the DB.
  if (!funclib_name.startsWith('FUNCLIB')) {
    return {
      ...base,
      error:     `funclib_name must start with "FUNCLIB". Received: "${funclib_name}"`,
      functions: [],
    };
  }

  try {
    const { rows, source, error, mockResponse } = await runQuery(
      SQL,
      [funclib_name],
      name
    );

    if (mockResponse) {
      return { ...mockResponse, funclib: funclib_name };
    }

    if (error) {
      return { ...base, source, error, functions: [] };
    }

    const functions = rows.map((row) => ({
      funclib_name: row.FUNCLIB_NAME,
      field_name:   row.FIELD_NAME,
      event_name:   row.EVENT_NAME,
      code:         row.PEOPLECODE,
    }));

    return { ...base, source, functions };
  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, functions: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
