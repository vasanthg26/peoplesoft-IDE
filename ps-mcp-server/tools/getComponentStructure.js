'use strict';

// SQL1 — Component Scroll Levels
// Returns each physical table (RECTYPE=0) used in the component plus its
// OCCURSLEVEL (0 = header/level-0, 1 = first grid, 2 = sub-grid, …).
// Excludes hidden fields (FIELDUSE bit 4 set).
// Bind: :1 = PNLGRPNAME (component name)
const SQL = `
SELECT DISTINCT D.recname     TableName,
                D.occurslevel ScrollLevel
FROM   pspnlgrpdefn A,
       pspnlgroup B,
       pspnlfield D,
       psrecdefn E
WHERE  A.pnlgrpname = B.pnlgrpname
       AND A.market = B.market
       AND A.pnlgrpname = :1
       AND A.market = :2
       AND E.recname = D.recname
       AND E.rectype IN ( 0 )
       AND To_char(Bitand(D.fielduse, 16)) <> '16'
ORDER  BY 2, 1
`.trim();

const { runQuery } = require('../db/config');

const name = 'get_component_structure';

const description =
  'Returns all physical tables used in a PeopleSoft component and their ' +
  'scroll levels. Scroll level 0 = header/level-0 record, 1 = first grid, ' +
  '2 = sub-grid, 3 = sub-sub-grid.';

const inputSchema = {
  type: 'object',
  properties: {
    component_name: {
      type:        'string',
      description: 'PeopleSoft component name (PNLGRPNAME), e.g. PURCHASE_ORDER',
    },
    market: {
      type:        'string',
      description: 'Market code — defaults to GBL',
      default:     'GBL',
    },
  },
  required: ['component_name'],
};

/**
 * @param {{ component_name: string, market?: string }} params
 * @returns {Promise<object>}
 */
async function handler({ component_name, market = 'GBL' }) {
  const base = { component: component_name, market, source: 'db' };

  try {
    const { rows, source, error, mockResponse } = await runQuery(
      SQL,
      [component_name, market],
      name
    );

    if (mockResponse) {
      return { ...mockResponse, component: component_name, market };
    }

    if (error) {
      return { ...base, source, error, scroll_levels: [] };
    }

    const scroll_levels = rows.map((row) => ({
      table_name:   row.TABLENAME,
      scroll_level: Number(row.SCROLLLEVEL),
    }));

    return { ...base, source, scroll_levels };
  } catch (err) {
    console.error(`[${name}] Unexpected error:`, err.message);
    return { ...base, error: err.message, scroll_levels: [] };
  }
}

module.exports = { name, description, inputSchema, handler };
