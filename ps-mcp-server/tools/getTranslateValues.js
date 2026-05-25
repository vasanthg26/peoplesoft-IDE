'use strict';

// SQL8 — Translate Values for a field
// Returns the valid translate (dropdown) values for a XLAT-backed field.
// These are the allowed coded values that appear in dropdowns/radio buttons.
// Bind: :1 = FIELDNAME
const SQL = `
SELECT X.FIELDNAME,
       X.FIELDVALUE,
       X.XLATLONGNAME,
       X.XLATSHORTNAME,
       X.EFF_STATUS,
       X.EFFDT
FROM   PSXLATITEM X
WHERE  X.FIELDNAME = :1
AND    X.EFF_STATUS = 'A'
AND    X.EFFDT = (SELECT MAX(X2.EFFDT)
                  FROM   PSXLATITEM X2
                  WHERE  X2.FIELDNAME = X.FIELDNAME
                  AND    X2.FIELDVALUE = X.FIELDVALUE
                  AND    X2.EFFDT <= SYSDATE)
ORDER  BY X.FIELDVALUE
`.trim();

const { runQuery } = require('../db/config');

const name = 'get_translate_values';

const description =
  'Returns the active translate (XLAT) values for a PeopleSoft field. ' +
  'These are the dropdown/radio button values with their long and short descriptions. ' +
  'Only returns active values (EFF_STATUS = A) with the latest effective date.';

const inputSchema = {
  type: 'object',
  properties: {
    field_name: {
      type:        'string',
      description: 'PeopleSoft field name (FIELDNAME), e.g. PO_STATUS, APPROVAL_STATUS',
    },
  },
  required: ['field_name'],
};

/**
 * @param {{ field_name: string }} params
 * @returns {Promise<object>}
 */
async function handler({ field_name }) {
  const base = { field: field_name, source: 'db' };

  try {
    const { rows, source, error, mockResponse } = await runQuery(
      SQL,
      [field_name],
      name
    );

    if (mockResponse) {
      return { ...mockResponse, field: field_name };
    }

    if (error) {
      return { ...base, source, error, values: [] };
    }

    const values = rows.map((row) => ({
      field_value: row.FIELDVALUE,
      long_name:   row.XLATLONGNAME,
      short_name:  row.XLATSHORTNAME,
    }));

    return { ...base, source, values };
  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, values: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
