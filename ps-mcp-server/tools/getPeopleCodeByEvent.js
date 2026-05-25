'use strict';

// SQL6a — Field-level PeopleCode
// Returns all PeopleCode events attached to a SPECIFIC field on a record.
// Use this to find FieldEdit, FieldChange, FieldFormula, FieldDefault etc.
// Bind: :1 = RECNAME, :2 = FIELDNAME
const SQL_FIELD = `
SELECT OBJECTVALUE1  AS RECORD_NAME,
       OBJECTVALUE2  AS FIELD_NAME,
       OBJECTVALUE3  AS EVENT_NAME,
       PCTEXT        AS PEOPLECODE
FROM   PSPCMTXT
WHERE  OBJECTID1 = 1
AND    OBJECTID2 = 2
AND    OBJECTID3 = 12
AND    OBJECTVALUE1 = :1
AND    OBJECTVALUE2 = :2
ORDER  BY OBJECTVALUE3
`.trim();

// SQL6b — Record-wide PeopleCode
// Returns all PeopleCode events for ALL fields on a record.
// Includes SavePreChange, SaveEdit, SavePostChange, RowInit on any field —
// critical for understanding save-time and init logic that may touch the target field.
// Bind: :1 = RECNAME
const SQL_RECORD = `
SELECT OBJECTVALUE1  AS RECORD_NAME,
       OBJECTVALUE2  AS FIELD_NAME,
       OBJECTVALUE3  AS EVENT_NAME,
       PCTEXT        AS PEOPLECODE
FROM   PSPCMTXT
WHERE  OBJECTID1 = 1
AND    OBJECTID2 = 2
AND    OBJECTID3 = 12
AND    OBJECTVALUE1 = :1
ORDER  BY OBJECTVALUE2, OBJECTVALUE3
`.trim();

const { runQuery, getMode } = require('../db/config');

const name = 'get_peoplecode_by_event';

const description =
  'Returns PeopleCode programs attached to a PeopleSoft record. ' +
  'When field_name is provided, returns two sections: ' +
  '(1) field_events — all events directly on that field (FieldEdit, FieldChange etc.) ' +
  '(2) record_events — all events across the entire record (SavePreChange, SaveEdit, RowInit etc.) ' +
  'so the AI understands the complete existing logic before making any changes.';

const inputSchema = {
  type: 'object',
  properties: {
    record_name: {
      type:        'string',
      description: 'PeopleSoft record name (RECNAME), e.g. PO_LINE_SHIP',
    },
    field_name: {
      type:        'string',
      description: 'Target field name (FIELDNAME), e.g. MERCHANDISE_AMT. ' +
                   'When provided, field_events will be filtered to this field only.',
    },
  },
  required: ['record_name'],
};

/**
 * @param {{ record_name: string, field_name?: string }} params
 * @returns {Promise<object>}
 */
async function handler({ record_name, field_name }) {
  const base = { record: record_name, source: 'db' };

  try {
    // --- Mock mode: check via getMode() — do NOT run empty SQL against Oracle ---
    if (getMode() === 'mock') {
      const mockData = require('../db/mock').getMock(name, [record_name]);
      const entries  = mockData?.peoplecode || [];
      const fieldEvents  = field_name ? entries.filter((e) => e.field_name === field_name) : entries;
      return { record: record_name, source: 'mock', field_name: field_name || null, field_events: fieldEvents, record_events: entries };
    }

    // --- Live DB: two targeted queries ---
    const [fieldResult, recordResult] = await Promise.all([
      field_name
        ? runQuery(SQL_FIELD, [record_name, field_name], name)
        : Promise.resolve({ rows: [] }),
      runQuery(SQL_RECORD, [record_name], name),
    ]);

    if (recordResult.error) {
      return { ...base, error: recordResult.error, field_events: [], record_events: [] };
    }

    const mapRow = (row) => ({
      record_name: row.RECORD_NAME,
      field_name:  row.FIELD_NAME,
      event_name:  row.EVENT_NAME,
      code:        row.PEOPLECODE,
    });

    const field_events  = (fieldResult.rows  || []).map(mapRow);
    const record_events = (recordResult.rows || []).map(mapRow);

    return {
      ...base,
      field_name:    field_name || null,
      field_events,   // Events directly on the target field
      record_events,  // All events across every field on the record
    };

  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, field_events: [], record_events: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
