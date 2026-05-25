'use strict';

// SQL4 — All Records with Type Decoded
// Covers both direct panel records and records that appear only in subpages,
// via a UNION. RECTYPE is decoded to a human-readable string.
// Bind: :1 = PNLGRPNAME (used twice — once per UNION branch)
const SQL = `
SELECT R.RECNAME AS RECORD_NAME,
       (CASE
          WHEN R.RECTYPE = 0 THEN 'Table'
          WHEN R.RECTYPE = 1 THEN 'View'
          WHEN R.RECTYPE = 2 THEN 'Derived'
          WHEN R.RECTYPE = 3 THEN 'Sub Record'
          WHEN R.RECTYPE = 5 THEN 'Dynamic View'
          WHEN R.RECTYPE = 6 THEN 'Query View'
          WHEN R.RECTYPE = 7 THEN 'Temporary Table'
          ELSE 'Unknown'
        END) AS RECORD_TYPE
FROM   PSRECDEFN R
WHERE  R.RECNAME IN
       (SELECT DISTINCT RECNAME FROM PSPNLFIELD
        WHERE PNLNAME IN
              (SELECT DISTINCT B.PNLNAME
               FROM PSPNLGROUP A, PSPNLFIELD B
               WHERE (A.PNLNAME = B.PNLNAME OR A.PNLNAME = B.SUBPNLNAME)
               AND A.PNLGRPNAME = :1
               AND RECNAME <> ' ')
        UNION
        SELECT DISTINCT RECNAME FROM PSPNLFIELD
        WHERE PNLNAME IN
              (SELECT DISTINCT B.SUBPNLNAME
               FROM PSPNLGROUP A, PSPNLFIELD B
               WHERE (A.PNLNAME = B.PNLNAME OR A.PNLNAME = B.SUBPNLNAME)
               AND A.PNLGRPNAME = :1))
AND R.RECNAME <> ' '
ORDER BY R.RECTYPE
`.trim();

const { runQuery } = require('../db/config');

const name = 'get_all_records';

const description =
  'Returns every record (table, view, derived, sub-record, etc.) referenced ' +
  'in a PeopleSoft component, including records that appear only in subpages. ' +
  'Record type is decoded to a human-readable string.';

const inputSchema = {
  type: 'object',
  properties: {
    component_name: {
      type:        'string',
      description: 'PeopleSoft component name (PNLGRPNAME), e.g. PURCHASE_ORDER',
    },
  },
  required: ['component_name'],
};

/**
 * @param {{ component_name: string }} params
 * @returns {Promise<object>}
 */
async function handler({ component_name }) {
  const base = { component: component_name, source: 'db' };

  try {
    // SQL4 uses :1 twice (once per UNION branch)
    const { rows, source, error, mockResponse } = await runQuery(
      SQL,
      [component_name, component_name],
      name
    );

    if (mockResponse) {
      return { ...mockResponse, component: component_name };
    }

    if (error) {
      return { ...base, source, error, records: [] };
    }

    const records = rows.map((row) => ({
      record_name: row.RECORD_NAME,
      record_type: row.RECORD_TYPE,
    }));

    return { ...base, source, records };
  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, records: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
