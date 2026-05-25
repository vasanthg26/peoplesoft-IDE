'use strict';

const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Auto-convert all CLOB/NCLOB columns to JS strings.
// This avoids ORA-06502 from DBMS_LOB.SUBSTR size limits in SQL context.
oracledb.fetchAsString = [oracledb.CLOB];

let pool = null;

/**
 * Build the connectString from environment variables.
 *
 * Priority:
 *   1. DB_TNS_ALIAS  — uses TNS name resolution via tnsnames.ora.
 *      TNS_ADMIN must point to the directory containing tnsnames.ora.
 *   2. DB_HOST + DB_PORT + DB_SERVICE  — Easy Connect string.
 *
 * @returns {{ connectString: string, mode: 'tns'|'easy' }}
 */
function buildConnectString() {
  if (process.env.DB_TNS_ALIAS) {
    if (process.env.TNS_ADMIN) {
      // oracledb reads TNS_ADMIN from the process environment automatically,
      // but setting it explicitly here ensures it is in place before pool init.
      process.env.TNS_ADMIN = process.env.TNS_ADMIN;
    }
    return { connectString: process.env.DB_TNS_ALIAS, mode: 'tns' };
  }

  const host    = process.env.DB_HOST    || 'localhost';
  const port    = process.env.DB_PORT    || '1521';
  const service = process.env.DB_SERVICE || '';
  return { connectString: `${host}:${port}/${service}`, mode: 'easy' };
}

/**
 * Initialise the connection pool from environment variables.
 * Resolves on success; resolves with { error } on failure so callers
 * can fall back to mock mode rather than crashing.
 */
async function connect() {
  const { connectString, mode } = buildConnectString();
  console.error(`[oracle] Connecting via ${mode === 'tns' ? `TNS alias "${connectString}"` : `Easy Connect "${connectString}"`}`);

  try {
    pool = await oracledb.createPool({
      user:          process.env.DB_USER,
      password:      process.env.DB_PASSWORD,
      connectString,
      privilege:     oracledb.SYSDBA,
      poolMin:       1,
      poolMax:       5,
      poolIncrement: 1,
      poolTimeout:   60,
    });
    return { connected: true };
  } catch (err) {
    console.error('[oracle] Pool init failed:', err.message);
    pool = null;
    return { connected: false, error: err.message };
  }
}

/**
 * Drain and close the pool gracefully.
 */
async function disconnect() {
  if (!pool) return;
  try {
    await pool.close(10);
    pool = null;
  } catch (err) {
    console.error('[oracle] Pool close failed:', err.message);
  }
}

/**
 * Execute a read-only SQL statement.
 *
 * @param {string}   sql    - Parameterised SQL with :1, :2, … bind positions
 * @param {Array}    params - Bind values in positional order
 * @returns {{ rows: object[] } | { rows: [], error: string }}
 */
async function executeQuery(sql, params = []) {
  if (!pool) {
    return {
      rows:  [],
      error: 'No active connection pool. Start the server with USE_MOCK=true or fix DB credentials.',
    };
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const result = await connection.execute(sql, params, { maxRows: 10000 });
    return { rows: result.rows };
  } catch (err) {
    console.error('[oracle] Query failed:', err.message);
    return { rows: [], error: err.message };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error('[oracle] Connection close failed:', closeErr.message);
      }
    }
  }
}

/**
 * True when the pool has been successfully initialised.
 */
function isConnected() {
  return pool !== null;
}

module.exports = { connect, disconnect, executeQuery, isConnected };
