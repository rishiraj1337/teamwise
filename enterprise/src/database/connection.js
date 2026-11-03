'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');
const logger = require('../core/logger');

let pool = null;

function parseDatabaseUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '3306', 10),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to parse DATABASE_URL');
    return null;
  }
}

function getPoolConfig() {
  const urlConfig = parseDatabaseUrl(env.DATABASE_URL);
  if (urlConfig) {
    return {
      ...urlConfig,
      waitForConnections: true,
      connectionLimit: env.DB_CONNECTION_LIMIT,
      connectTimeout: env.DB_CONNECT_TIMEOUT,
      timezone: 'Z',
      dateStrings: false,
    };
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: env.DB_CONNECTION_LIMIT,
    connectTimeout: env.DB_CONNECT_TIMEOUT,
    timezone: 'Z',
    dateStrings: false,
  };
}

function getPool() {
  if (!pool) {
    const config = getPoolConfig();
    pool = mysql.createPool(config);
    logger.debug({ host: config.host, port: config.port, database: config.database }, 'Database connection pool initialized');
  }
  return pool;
}

async function testConnection() {
  try {
    const p = getPool();
    const [rows] = await p.query('SELECT 1 AS healthy');
    return rows && rows[0] && rows[0].healthy === 1;
  } catch (err) {
    logger.error({ error: err.message }, 'Database health check query failed');
    return false;
  }
}

async function withTransaction(callback) {
  const p = getPool();
  const conn = await p.getConnection();
  let transactionActive = false;
  try {
    await conn.beginTransaction();
    transactionActive = true;
    const result = await callback(conn);
    await conn.commit();
    transactionActive = false;
    return result;
  } catch (err) {
    if (transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        logger.error({ error: rollbackErr.message }, 'Transaction rollback failed');
      }
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function closePool() {
  if (pool) {
    logger.debug('Closing database connection pool');
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testConnection,
  withTransaction,
  closePool,
};
