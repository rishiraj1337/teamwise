'use strict';

const { buildReviewAnalytics } = require('./reviewAnalytics');

function escapeLikePattern(raw) {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function appendAnalyticsSections(rows, analytics) {
  const lines = [...rows, ''];

  const section = (title, slices) => {
    lines.push(title);
    lines.push('label,count');
    for (const slice of slices || []) {
      lines.push(`"${String(slice.label).replace(/"/g, '""')}",${slice.value}`);
    }
    lines.push('');
  };

  section('PIVOT_CATEGORY_BREAKDOWN', analytics.category_breakdown);
  section('PIVOT_PRIORITY_BREAKDOWN', analytics.priority_breakdown);
  section('PIVOT_SENTIMENT_BREAKDOWN', analytics.sentiment_breakdown);
  section('PIVOT_TICKET_STATUS', analytics.ticket_breakdown);

  lines.push('PIVOT_CATEGORY_DETAIL');
  lines.push('category,subcategory,count');
  for (const block of analytics.category_detail || []) {
    for (const sub of block.subcategories || []) {
      lines.push(
        `"${String(block.category).replace(/"/g, '""')}","${String(sub.label).replace(/"/g, '""')}",${sub.value}`,
      );
    }
  }

  return lines.join('\n');
}

async function buildFilteredReviewExportCsv(findReviews, filters = {}) {
  const limit = Math.min(Number(filters.limit) || 5000, 5000);
  let page = 1;
  let totalPages = 1;
  const allReviews = [];

  while (page <= totalPages && allReviews.length < limit) {
    const batch = await findReviews({
      ...filters,
      page,
      limit: Math.min(500, limit - allReviews.length),
    });
    allReviews.push(...(batch.reviews || []));
    totalPages = batch.totalPages || 1;
    page += 1;
    if ((batch.reviews || []).length === 0) break;
  }

  const analytics = await buildReviewAnalytics();

  if (allReviews.length === 0) {
    return appendAnalyticsSections([], analytics);
  }

  const headers = Object.keys(allReviews[0]);
  const lines = [headers.join(',')];
  for (const rev of allReviews) {
    lines.push(headers.map((h) => sanitizeCsvCell(rev[h])).join(','));
  }

  return appendAnalyticsSections(lines, analytics);
}

module.exports = {
  escapeLikePattern,
  buildFilteredReviewExportCsv,
  sanitizeCsvCell,
};
