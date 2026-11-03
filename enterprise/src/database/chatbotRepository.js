'use strict';

const { getPool } = require('./connection');
const { ensureCategorySubcategory } = require('./taxonomyRepository');

class ChatbotRepository {
  async saveSession(item, reviewUniqueId = null) {
    const pool = getPool();
    const txn = item.txnDetails || {};
    const chatDetails = Array.isArray(item.chatDetails) ? item.chatDetails : [];
    const amount = Number(txn.amount) || 0.00;
    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();

    const sql = `
      INSERT INTO chatbot_sessions (
        id, complaint_id, category_name, ticket_category, status,
        rating_app, feedback_rate, payer_name, mob_no, amount,
        txn_type, txn_status, final_status, rrn, txn_id,
        app_version, device_model, created_at, chat_details, txn_details,
        review_unique_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
      ON DUPLICATE KEY UPDATE
        category_name = VALUES(category_name),
        ticket_category = VALUES(ticket_category),
        status = VALUES(status),
        rating_app = VALUES(rating_app),
        feedback_rate = VALUES(feedback_rate),
        final_status = VALUES(final_status),
        chat_details = VALUES(chat_details),
        txn_details = VALUES(txn_details),
        review_unique_id = COALESCE(VALUES(review_unique_id), review_unique_id),
        updated_at = NOW(3)
    `;

    const values = [
      String(item._id || item.id),
      String(item.complaintId || item.complainId || 'N/A'),
      String(item.categoryName || 'N/A'),
      String(item.ticketCategory || 'N/A'),
      typeof item.status === 'number' ? item.status : 0,
      item.ratingApp !== null && item.ratingApp !== undefined ? String(item.ratingApp) : null,
      String(item.feedbackRate || ''),
      String(txn.payerName || 'N/A'),
      String(txn.mobNo || txn.mbNumber || 'N/A'),
      amount,
      String(txn.txnType || 'N/A'),
      String(txn.txnStatus || 'N/A'),
      String(txn.finalStatus || 'N/A'),
      String(txn.rrn || 'N/A'),
      String(txn.txnId || 'N/A'),
      String(txn.appversionno || 'N/A'),
      String(txn.devicemodel ? `${txn.devicename || ''} ${txn.devicemodel}`.trim() : 'N/A'),
      createdAt,
      JSON.stringify(chatDetails),
      JSON.stringify(txn),
      reviewUniqueId,
    ];

    await pool.query(sql, values);
  }

  async findSessions({
    page = 1,
    limit = 20,
    txnType = null,
    status = null,
    categoryName = null,
    search = null,
    fromDate = null,
    toDate = null,
  } = {}) {
    const pool = getPool();
    const offset = (Math.max(1, page) - 1) * Math.max(1, limit);
    const conditions = [];
    const params = [];

    if (txnType) {
      conditions.push('txn_type = ?');
      params.push(txnType);
    }
    if (status !== null && status !== undefined && status !== '') {
      conditions.push('status = ?');
      params.push(Number(status));
    }
    if (categoryName) {
      conditions.push('category_name = ?');
      params.push(categoryName);
    }
    if (search) {
      conditions.push('(complaint_id LIKE ? OR payer_name LIKE ? OR mob_no LIKE ? OR rrn LIKE ? OR txn_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (fromDate) {
      conditions.push('created_at >= ?');
      params.push(new Date(fromDate));
    }
    if (toDate) {
      conditions.push('created_at <= ?');
      params.push(new Date(toDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM chatbot_sessions ${whereClause}`,
      params
    );
    const total = Number(countRows[0].total || 0);

    const querySql = `
      SELECT id, complaint_id, category_name, ticket_category, status,
             rating_app, feedback_rate, payer_name, mob_no, amount,
             txn_type, txn_status, final_status, rrn, txn_id,
             app_version, device_model, created_at, review_unique_id
      FROM chatbot_sessions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(querySql, [...params, Number(limit), Number(offset)]);

    return {
      items: rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }

  async getSessionById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT * FROM chatbot_sessions WHERE id = ? OR complaint_id = ? LIMIT 1',
      [id, id]
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    let chatDetails = [];
    let txnDetails = {};
    try {
      chatDetails = typeof row.chat_details === 'string' ? JSON.parse(row.chat_details) : row.chat_details;
    } catch (e) {}
    try {
      txnDetails = typeof row.txn_details === 'string' ? JSON.parse(row.txn_details) : row.txn_details;
    } catch (e) {}

    return {
      ...row,
      chat_details: chatDetails,
      txn_details: txnDetails,
    };
  }

  async saveCategories(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const pool = getPool();
    for (const item of items) {
      const name = String(item.name || 'General').trim();
      if (!name || name === 'N/A') continue;
      const isActive = item.active !== false ? 1 : 0;
      await pool.query(
        `INSERT INTO review_category (name, is_active) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
        [name, isActive],
      );
      if (isActive) {
        await ensureCategorySubcategory(name, 'General');
      }
    }
  }

  async getCategories() {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, is_active AS active
       FROM review_category
       WHERE is_active = 1
       ORDER BY name ASC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      active: Boolean(row.active),
    }));
  }

  async getSummaryStats() {
    const pool = getPool();
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total, SUM(amount) AS totalAmount FROM chatbot_sessions');
    const [statusRows] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM chatbot_sessions GROUP BY status'
    );
    const [txnTypeRows] = await pool.query(
      'SELECT txn_type, COUNT(*) AS count FROM chatbot_sessions GROUP BY txn_type'
    );
    const [categoryRows] = await pool.query(
      'SELECT category_name, COUNT(*) AS count FROM chatbot_sessions GROUP BY category_name ORDER BY count DESC LIMIT 10'
    );

    const statusCounts = { open: 0, closed: 0, inProgress: 0 };
    for (const r of statusRows) {
      if (r.status === 0) statusCounts.open = Number(r.count);
      else if (r.status === 1) statusCounts.closed = Number(r.count);
      else if (r.status === 2) statusCounts.inProgress = Number(r.count);
    }

    return {
      total: Number(totalRows[0].total || 0),
      totalAmount: Number(totalRows[0].totalAmount || 0),
      statusCounts,
      txnTypeCounts: txnTypeRows.reduce((acc, r) => {
        acc[r.txn_type] = Number(r.count);
        return acc;
      }, {}),
      categories: categoryRows.map(r => ({ category: r.category_name, count: Number(r.count) })),
    };
  }
}

const chatbotRepository = new ChatbotRepository();

module.exports = {
  ChatbotRepository,
  chatbotRepository,
};
