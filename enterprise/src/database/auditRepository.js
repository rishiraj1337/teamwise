'use strict';

const { getPool } = require('./connection');
const logger = require('../core/logger');

function buildListConditions(filters = {}) {
  const { action, resource, search, startDate, endDate } = filters;
  const conditions = [];
  const params = [];

  if (action) {
    conditions.push('action LIKE ?');
    params.push(`%${String(action).trim()}%`);
  }
  if (resource) {
    conditions.push('resource LIKE ?');
    params.push(`%${String(resource).trim()}%`);
  }
  if (search) {
    const term = `%${String(search).trim()}%`;
    conditions.push(`(
      user_email LIKE ?
      OR action LIKE ?
      OR resource LIKE ?
      OR details LIKE ?
    )`);
    params.push(term, term, term, term);
  }
  if (startDate) {
    conditions.push('created_at >= ?');
    params.push(new Date(startDate));
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      conditions.push('created_at <= ?');
      params.push(end);
    }
  }

  return { conditions, params };
}

class AuditRepository {
  async log({ userId = null, userEmail = 'system', action, resource, details = null, ipAddress = '127.0.0.1' }) {
    try {
      const pool = getPool();
      const stringDetails = typeof details === 'object' && details !== null ? JSON.stringify(details) : details;
      await pool.query(
        `INSERT INTO audit_logs (user_id, user_email, action, resource, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
        [userId, userEmail, action, resource, stringDetails, ipAddress]
      );
    } catch (err) {
      logger.error({ error: err.message, action, resource }, 'Failed to write audit log entry');
    }
  }

  async listLogs({ limit = 100, offset = 0, action = null, resource = null, search = null, startDate = null, endDate = null } = {}) {
    const pool = getPool();
    const { conditions, params } = buildListConditions({ action, resource, search, startDate, endDate });
    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM audit_logs${whereClause}`;
    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows[0].total);

    let query =
      'SELECT id, user_id, user_email, action, resource, details, ip_address, created_at FROM audit_logs';
    query += whereClause;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const [rows] = await pool.query(query, [...params, Number(limit), Number(offset)]);

    return {
      logs: rows,
      total,
    };
  }
}

const auditRepository = new AuditRepository();

module.exports = {
  AuditRepository,
  auditRepository,
  buildListConditions,
};
