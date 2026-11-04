'use strict';

const { getPool } = require('../database/connection');
const { loadTaxonomy } = require('../database/taxonomyRepository');

const OPEN_STATUSES = new Set(['new', 'in progress', 'open', 'pending']);
const RESOLVED_STATUSES = new Set(['resolved', 'closed', 'done', 'complete']);

function reviewDateFilter(startDate, endDate) {
  const clauses = [];
  const params = [];
  if (startDate) {
    clauses.push('review_timestamp >= ?');
    params.push(new Date(startDate));
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      clauses.push('review_timestamp <= ?');
      params.push(end);
    }
  }
  const sql = clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '';
  return { sql, params };
}

async function distinctColumn(column) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT DISTINCT \`${column}\` AS value FROM \`review\`
     WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> '' AND \`${column}\` <> 'N/A'
     ORDER BY \`${column}\` ASC`,
  );
  return rows.map((row) => String(row.value));
}

async function buildReviewAnalytics({ startDate = null, endDate = null } = {}) {
  const pool = getPool();
  const { sql: dateSql, params: dateParams } = reviewDateFilter(startDate, endDate);

  const [categoryRows] = await pool.query(
    `SELECT category, COUNT(*) AS count FROM \`review\`
     WHERE category <> 'N/A'${dateSql} GROUP BY category ORDER BY count DESC`,
    dateParams,
  );
  const category_breakdown = categoryRows.map((row) => ({
    label: String(row.category || 'Unknown'),
    value: Number(row.count),
  }));

  const [detailRows] = await pool.query(
    `SELECT category, subcategory, COUNT(*) AS count FROM \`review\`
     WHERE category <> 'N/A'${dateSql}
     GROUP BY category, subcategory
     ORDER BY category ASC, count DESC`,
    dateParams,
  );
  const detailByCategory = {};
  for (const row of detailRows) {
    const name = String(row.category || 'Unknown');
    if (!detailByCategory[name]) detailByCategory[name] = [];
    detailByCategory[name].push({
      label: String(row.subcategory || 'Unknown'),
      value: Number(row.count),
    });
  }
  const category_detail = category_breakdown.map((item) => ({
    category: item.label,
    count: item.value,
    subcategories: detailByCategory[item.label] || [],
  }));

  const [sentimentRows] = await pool.query(
    `SELECT CASE WHEN star_ratings >= 4 THEN 'Positive' ELSE 'Negative' END AS label,
            COUNT(*) AS count
     FROM \`review\` WHERE 1=1${dateSql} GROUP BY label`,
    dateParams,
  );
  const sentiment_breakdown = sentimentRows.map((row) => ({
    label: String(row.label),
    value: Number(row.count),
  }));

  const [priorityRows] = await pool.query(
    `SELECT priority, COUNT(*) AS count FROM \`review\`
     WHERE priority <> 'N/A'${dateSql} GROUP BY priority ORDER BY count DESC`,
    dateParams,
  );
  const priority_breakdown = priorityRows.map((row) => ({
    label: String(row.priority || 'Unknown'),
    value: Number(row.count),
  }));

  const [statusRows] = await pool.query(
    `SELECT LOWER(status) AS status, COUNT(*) AS count FROM \`review\`
     WHERE status <> 'N/A'${dateSql} GROUP BY LOWER(status)`,
    dateParams,
  );
  let openCount = 0;
  let resolvedCount = 0;
  for (const row of statusRows) {
    const normalized = String(row.status || '').trim();
    if (OPEN_STATUSES.has(normalized)) openCount += Number(row.count);
    else if (RESOLVED_STATUSES.has(normalized)) resolvedCount += Number(row.count);
  }

  const taxonomy = await loadTaxonomy();
  const [channelRows] = await pool.query(
    `SELECT DISTINCT channel AS value FROM \`review\`
     WHERE channel IS NOT NULL AND channel <> '' ORDER BY channel ASC`,
  );

  return {
    category_breakdown,
    category_detail,
    sentiment_breakdown,
    priority_breakdown,
    ticket_breakdown: [
      { label: 'Open', value: openCount },
      { label: 'Resolved', value: resolvedCount },
    ],
    filter_options: {
      categories: taxonomy.categories,
      priorities: taxonomy.priorities,
      statuses: taxonomy.statuses,
      channels: Array.from(new Set(channelRows.map((row) => (row.value === 'Email-SFTP' ? 'Email' : String(row.value))))),
    },
  };
}

module.exports = {
  buildReviewAnalytics,
  distinctColumn,
};
