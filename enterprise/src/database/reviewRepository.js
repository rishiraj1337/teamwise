'use strict';

const { getPool } = require('./connection');
const logger = require('../core/logger');
const { ensureCategorySubcategory } = require('./taxonomyRepository');
const { escapeLikePattern } = require('../services/reviewExport');
const { truncateUtf8 } = require('../core/stringUtil');
const { extractCustomerMetadata } = require('../services/metadataParser');

const REVIEW_LINK_MAX_BYTES = 512;

const REVIEW_COLUMNS = [
  'channel',
  'unique_id',
  'app_version_code',
  'app_version_name',
  'review_timestamp',
  'star_ratings',
  'review_text',
  'category',
  'subcategory',
  'priority',
  'status',
  'resolution',
  'department',
  'response_timestamp',
  'resolution_date',
  'developer_reply_time',
  'developer_reply_text',
  'review_link',
  'created_at',
  'updated_at',
];

class ReviewRepository {
  async getNextTprId(connection = null) {
    const conn = connection || (await getPool().getConnection());
    const shouldRelease = !connection;

    try {
      await conn.query('UPDATE review_id_sequence SET next_id = LAST_INSERT_ID(next_id + 1) WHERE id = 1');
      const [rows] = await conn.query('SELECT LAST_INSERT_ID() AS assigned_id');
      const nextId = rows && rows.length > 0 && Number(rows[0].assigned_id) > 1
        ? Number(rows[0].assigned_id) - 1
        : 1;
      return `TPR${String(nextId).padStart(4, '0')}`;
    } catch (err) {
      await conn.query('INSERT IGNORE INTO review_id_sequence (id, next_id) VALUES (1, 2)');
      return 'TPR0001';
    } finally {
      if (shouldRelease) {
        conn.release();
      }
    }
  }

  async upsertReview(data) {
    const pool = getPool();
    const now = new Date();

    let uniqueId = data.unique_id;
    if (!uniqueId || uniqueId === 'N/A' || uniqueId === '') {
      uniqueId = await this.getNextTprId();
    }

    const record = {
      channel: data.channel === 'Email-SFTP' ? 'Email' : (data.channel || 'Email'),
      unique_id: uniqueId,
      app_version_code: data.app_version_code || 'N/A',
      app_version_name: data.app_version_name || 'N/A',
      review_timestamp: data.review_timestamp ? new Date(data.review_timestamp) : now,
      star_ratings: Math.max(1, Math.min(5, Number(data.star_ratings) || 3)),
      review_text: (data.review_text || 'N/A').slice(0, 1000),
      category: (data.category || 'N/A').slice(0, 100),
      subcategory: data.subcategory || 'N/A',
      priority: data.priority || 'Medium',
      status: data.status || 'New',
      resolution: (data.resolution || 'N/A').slice(0, 1000),
      department: data.department || 'Customer Support',
      response_timestamp: data.response_timestamp ? new Date(data.response_timestamp) : null,
      resolution_date: data.resolution_date ? new Date(data.resolution_date) : null,
      developer_reply_time: data.developer_reply_time ? new Date(data.developer_reply_time) : null,
      developer_reply_text: (data.developer_reply_text || 'N/A').slice(0, 1000),
      review_link: truncateUtf8(data.review_link || 'N/A', REVIEW_LINK_MAX_BYTES) || 'N/A',
      created_at: data.created_at ? new Date(data.created_at) : now,
      updated_at: now,
    };

    const values = REVIEW_COLUMNS.map(col => record[col]);
    const placeholders = REVIEW_COLUMNS.map(() => '?').join(', ');
    const updateClauses = REVIEW_COLUMNS
      .filter(col => col !== 'unique_id' && col !== 'created_at')
      .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
      .join(', ');

    const sql = `
      INSERT INTO \`review\` (${REVIEW_COLUMNS.map(c => `\`${c}\``).join(', ')})
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateClauses}
    `;

    await pool.query(sql, values);

    try {
      const ids = await ensureCategorySubcategory(record.category, record.subcategory);
      if (ids?.categoryId) {
        await pool.query(
          'UPDATE `review` SET `category_id` = ?, `subcategory_id` = ? WHERE `unique_id` = ?',
          [ids.categoryId, ids.subcategoryId, record.unique_id],
        );
      }
    } catch (err) {
      logger.warn({ err: err.message, uniqueId: record.unique_id }, 'Failed to sync review taxonomy FKs');
    }

    return record;
  }

  async findReviews({
    page = 1,
    limit = 20,
    channel = null,
    starRating = null,
    minStarRating = null,
    maxStarRating = null,
    category = null,
    priority = null,
    status = null,
    statusGroup = null,
    search = null,
    startDate = null,
    endDate = null,
    sortBy = 'review_timestamp',
    sortOrder = 'DESC',
  } = {}) {
    const pool = getPool();
    const offset = (Math.max(1, page) - 1) * Math.max(1, limit);
    const conditions = [];
    const params = [];

    if (channel && channel !== 'All') {
      if (channel === 'Email' || channel === 'Email-SFTP') {
        conditions.push("(channel = 'Email' OR channel = 'Email-SFTP')");
      } else {
        conditions.push('channel = ?');
        params.push(channel);
      }
    }
    if (starRating !== null && starRating !== undefined && starRating !== '') {
      conditions.push('star_ratings = ?');
      params.push(Number(starRating));
    } else {
      if (minStarRating !== null && minStarRating !== undefined && minStarRating !== '') {
        conditions.push('star_ratings >= ?');
        params.push(Number(minStarRating));
      }
      if (maxStarRating !== null && maxStarRating !== undefined && maxStarRating !== '') {
        conditions.push('star_ratings <= ?');
        params.push(Number(maxStarRating));
      }
    }
    if (category && category !== 'All') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (priority && priority !== 'All') {
      conditions.push('priority = ?');
      params.push(priority);
    }
    if (status && status !== 'All') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (statusGroup === 'open') {
      conditions.push(`LOWER(TRIM(status)) IN ('new', 'in progress', 'inprogress', 'open', 'pending')`);
    } else if (statusGroup === 'resolved') {
      conditions.push(`LOWER(TRIM(status)) IN ('resolved', 'closed', 'done', 'complete')`);
    }
    if (search && String(search).trim()) {
      const term = `%${escapeLikePattern(String(search).trim())}%`;
      conditions.push(`(
        review_text LIKE ?
        OR unique_id LIKE ?
        OR category LIKE ?
        OR subcategory LIKE ?
        OR department LIKE ?
        OR resolution LIKE ?
        OR developer_reply_text LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }
    if (startDate) {
      const startStr = typeof startDate === 'string' ? startDate.trim() : '';
      let start;
      if (/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
        start = new Date(`${startStr}T00:00:00`);
      } else {
        start = new Date(startDate);
      }
      if (!Number.isNaN(start.getTime())) {
        conditions.push('review_timestamp >= ?');
        params.push(start);
      }
    }
    if (endDate) {
      const endStr = typeof endDate === 'string' ? endDate.trim() : '';
      let end;
      if (/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        end = new Date(`${endStr}T23:59:59.999`);
      } else {
        end = new Date(endDate);
        if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0) {
          end.setHours(23, 59, 59, 999);
        }
      }
      if (!Number.isNaN(end.getTime())) {
        conditions.push('review_timestamp <= ?');
        params.push(end);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeSortBy = ['review_timestamp', 'star_ratings', 'created_at', 'unique_id'].includes(sortBy) ? sortBy : 'review_timestamp';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countSql = `SELECT COUNT(*) AS total FROM \`review\` ${whereClause}`;
    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows[0].total);

    const querySql = `
      SELECT ${REVIEW_COLUMNS.map(c => `\`${c}\``).join(', ')}
      FROM \`review\`
      ${whereClause}
      ORDER BY \`${safeSortBy}\` ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(querySql, [...params, Number(limit), Number(offset)]);
    const normalizedRows = rows.map((r) => {
      const channel = r.channel === 'Email-SFTP' ? 'Email' : r.channel;
      return {
        ...r,
        channel,
        parsed_metadata: extractCustomerMetadata({ ...r, channel }),
      };
    });

    return {
      reviews: normalizedRows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }

  async getSummaryStats() {
    const pool = getPool();
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total, AVG(star_ratings) AS avgRating FROM \`review\`');
    const [ratingBreakdown] = await pool.query(
      'SELECT star_ratings, COUNT(*) AS count FROM \`review\` GROUP BY star_ratings ORDER BY star_ratings DESC'
    );
    const [channelBreakdown] = await pool.query(
      'SELECT channel, COUNT(*) AS count FROM \`review\` GROUP BY channel'
    );
    const [categoryBreakdown] = await pool.query(
      'SELECT category, COUNT(*) AS count FROM \`review\` GROUP BY category ORDER BY count DESC LIMIT 10'
    );
    const [recent24h] = await pool.query(
      'SELECT COUNT(*) AS count FROM \`review\` WHERE review_timestamp >= NOW() - INTERVAL 1 DAY'
    );

    return {
      total: Number(totalRows[0].total || 0),
      averageRating: parseFloat(Number(totalRows[0].avgRating || 0).toFixed(2)),
      recent24h: Number(recent24h[0].count || 0),
      ratings: ratingBreakdown.reduce((acc, row) => {
        acc[row.star_ratings] = Number(row.count);
        return acc;
      }, {}),
      channels: channelBreakdown.reduce((acc, row) => {
        acc[row.channel] = Number(row.count);
        return acc;
      }, {}),
      categories: categoryBreakdown.map(row => ({
        category: row.category,
        count: Number(row.count),
      })),
    };
  }

  async saveNotificationSubscription(userId, subscription, deviceLabel = 'Desktop') {
    const pool = getPool();
    const endpoint = subscription.endpoint;
    const auth = subscription.keys?.auth || '';
    const p256dh = subscription.keys?.p256dh || '';

    await pool.query(
      `INSERT INTO notification_subscriptions (user_id, endpoint, keys_auth, keys_p256dh, device_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE updated_at = NOW(3)`,
      [userId, endpoint, auth, p256dh, deviceLabel]
    );
  }

  async listNotificationSubscriptions() {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, user_id, endpoint, keys_auth, keys_p256dh, device_label FROM notification_subscriptions');
    return rows;
  }

  async saveFilteredEmail(data) {
    const pool = getPool();
    const messageId = String(data.messageId || data.message_id || '').slice(0, 255);
    const fromAddress = String(data.fromAddress || data.from_address || data.from || '').slice(0, 255);
    const subject = String(data.subject || '').slice(0, 500);
    const receivedDateTime = data.receivedDateTime ? new Date(data.receivedDateTime) : new Date();
    const supportFlag = String(data.supportFlag || data.support_flag || 'not_support').slice(0, 50);
    const rejectionReason = String(data.rejectionReason || data.rejection_reason || 'Flagged as non-support').slice(0, 255);
    const fileName = String(data.fileName || data.file_name || '').slice(0, 255);
    const bodySnippet = String(data.bodySnippet || data.body_snippet || data.bodyText || '').slice(0, 1000);
    const rawMetadata = data.rawMetadata ? JSON.stringify(data.rawMetadata) : null;

    const [result] = await pool.query(
      `INSERT INTO filtered_emails 
       (message_id, from_address, subject, received_date_time, support_flag, rejection_reason, file_name, body_snippet, raw_metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [messageId, fromAddress, subject, receivedDateTime, supportFlag, rejectionReason, fileName, bodySnippet, rawMetadata]
    );

    return {
      id: result.insertId,
      messageId,
      supportFlag,
      rejectionReason,
      fileName,
    };
  }

  async findFilteredEmails({ page = 1, limit = 20, supportFlag = null, search = null } = {}) {
    const pool = getPool();
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [];
    const params = [];

    if (supportFlag) {
      conditions.push('support_flag = ?');
      params.push(supportFlag);
    }

    if (search) {
      conditions.push('(subject LIKE ? OR from_address LIKE ? OR rejection_reason LIKE ? OR body_snippet LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM \`filtered_emails\` ${whereClause}`;
    const [countRows] = await pool.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const querySql = `
      SELECT id, message_id, from_address, subject, received_date_time, support_flag, rejection_reason, file_name, body_snippet, raw_metadata, created_at
      FROM \`filtered_emails\`
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(querySql, [...params, safeLimit, offset]);

    return {
      items: rows,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  }

  async getFilteredStats() {
    const pool = getPool();
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM `filtered_emails`');
    const [breakdownRows] = await pool.query(
      'SELECT support_flag, COUNT(*) AS count FROM `filtered_emails` GROUP BY support_flag'
    );

    return {
      total: Number(totalRows[0]?.total || 0),
      byFlag: breakdownRows.reduce((acc, r) => {
        acc[r.support_flag] = Number(r.count);
        return acc;
      }, {}),
    };
  }
}

const reviewRepository = new ReviewRepository();

module.exports = {
  ReviewRepository,
  reviewRepository,
};
