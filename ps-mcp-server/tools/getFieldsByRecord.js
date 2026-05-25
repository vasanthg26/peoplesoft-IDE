'use strict';

// SQL5 — Record Fields with Keys
// Returns every field in a record with data type, length, and key flags.
// Key flags are derived from the USEEDIT bitmask via MOD arithmetic in SQL.
// The DB returns 'Y' or ' ' (space); we convert to boolean in the handler.
// Bind: :1 = RECNAME
const SQL = `
SELECT R.RECNAME,
       R.FIELDNUM,
       R.FIELDNAME,
       D.FIELDTYPE,
       D.LENGTH,
       D.DESCRLONG   AS FIELD_LABEL,
       CASE MOD(R.USEEDIT, 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_KEY,
       CASE MOD((R.USEEDIT/256), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_REQUIRED,
       CASE MOD((R.USEEDIT/2048), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_SEARCH_KEY,
       CASE MOD((R.USEEDIT/32), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_LIST_BOX
FROM   PSRECFIELD R,
       PSDBFIELD D
WHERE  R.RECNAME = :1
AND    R.FIELDNAME = D.FIELDNAME
ORDER  BY R.FIELDNUM
`.trim();

const { runQuery } = require('../db/config');

const name = 'get_fields_by_record';

const description =
  'Returns all fields of a PeopleSoft record with their data types, lengths, ' +
  'and key flags (key, required, search key, list box). ' +
  'field_type codes: 0=Char, 1=Long Char, 2=Number, 3=Signed Number, ' +
  '4=Date, 5=Time, 6=DateTime, 8=Image/Attachment.';

const inputSchema = {
  type: 'object',
  properties: {
    record_name: {
      type:        'string',
      description: 'PeopleSoft record name (RECNAME), e.g. PO_HDR',
    },
  },
  required: ['record_name'],
};

/** Convert the SQL 'Y' / ' ' flag string to a boolean. */
const yToBoolean = (val) => val === 'Y';

/**
 * @param {{ record_name: string }} params
 * @returns {Promise<object>}
 */
async function handler({ record_name }) {
  const base = { record: record_name, source: 'db' };

  try {
    const { rows, source, error, mockResponse } = await runQuery(
      SQL,
      [record_name],
      name
    );

    if (mockResponse) {
      return { ...mockResponse, record: record_name };
    }

    if (error) {
      return { ...base, source, error, fields: [] };
    }

    const fields = rows.map((row) => ({
      field_num:     Number(row.FIELDNUM),
      field_name:    row.FIELDNAME,
      field_label:   row.FIELD_LABEL || row.FIELDNAME, // Human-readable label for semantic AI matching
      field_type:    Number(row.FIELDTYPE),
      length:        Number(row.LENGTH),
      is_key:        yToBoolean(row.IS_KEY),
      is_required:   yToBoolean(row.IS_REQUIRED),
      is_search_key: yToBoolean(row.IS_SEARCH_KEY),
      is_list_box:   yToBoolean(row.IS_LIST_BOX),
    }));

    return { ...base, source, fields };
  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, fields: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
