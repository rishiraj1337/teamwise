'use strict';

const express = require('express');
const router = express.Router();
const { reviewRepository } = require('../../database/reviewRepository');
const { loadTaxonomy, validateReviewFields } = require('../../database/taxonomyRepository');
const { buildReviewAnalytics } = require('../../services/reviewAnalytics');
const { buildFilteredReviewExportCsv } = require('../../services/reviewExport');
const { ValidationError } = require('../../core/errors');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const { writeAuditLog } = require('../../core/auditLog');

router.use(authenticate);

function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Mitigate formula injection (CWE-1236): prefix leading =, +, -, @, \t, \r with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function parseReviewListQuery(query) {
  const {
    page = 1,
    limit = 20,
    channel,
    starRating,
    minStarRating,
    maxStarRating,
    min_rating: minRatingSnake,
    max_rating: maxRatingSnake,
    category,
    priority,
    status,
    statusGroup,
    status_group: statusGroupSnake,
    search,
    startDate,
    endDate,
    sortBy = 'review_timestamp',
    sortOrder = 'DESC',
  } = query;

  const minR = minStarRating ?? minRatingSnake;
  const maxR = maxStarRating ?? maxRatingSnake;
  let exactStar = starRating;
  if (
    (exactStar === undefined || exactStar === '') &&
    minR !== undefined &&
    minR !== '' &&
    maxR !== undefined &&
    maxR !== '' &&
    String(minR) === String(maxR)
  ) {
    exactStar = minR;
  }

  return {
    page: Math.max(1, parseInt(page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    channel: channel && channel !== 'All' ? channel : null,
    starRating: exactStar !== undefined && exactStar !== '' ? parseInt(exactStar, 10) : null,
    minStarRating:
      exactStar !== undefined && exactStar !== '' && exactStar !== null
        ? null
        : minR !== undefined && minR !== '' ? parseInt(minR, 10) : null,
    maxStarRating:
      exactStar !== undefined && exactStar !== '' && exactStar !== null
        ? null
        : maxR !== undefined && maxR !== '' ? parseInt(maxR, 10) : null,
    category: category && category !== 'All' ? category : null,
    priority: priority !== undefined && priority !== '' && priority !== 'All' ? priority : null,
    status: status !== undefined && status !== '' && status !== 'All' ? status : null,
    statusGroup:
      statusGroup === 'open' || statusGroup === 'resolved'
        ? statusGroup
        : statusGroupSnake === 'open' || statusGroupSnake === 'resolved'
          ? statusGroupSnake
          : null,
    search: search !== undefined && search !== null ? String(search).trim() : null,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  };
}

router.get('/', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const data = await reviewRepository.findReviews(parseReviewListQuery(req.query));

    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const stats = await reviewRepository.getSummaryStats();
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

router.get('/taxonomy', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const taxonomy = await loadTaxonomy();
    res.json({
      success: true,
      priorities: taxonomy.priorities,
      categories: Object.entries(taxonomy.subcategories).map(([name, subcategories]) => ({
        name,
        subcategories,
      })),
      statuses: taxonomy.statuses,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', requirePermission('reviews:read'), async (req, res, next) => {
  try {
    const analytics = await buildReviewAnalytics({
      startDate: req.query.startDate || req.query.dateFrom,
      endDate: req.query.endDate || req.query.dateTo,
    });
    res.json({ success: true, ...analytics });
  } catch (err) {
    next(err);
  }
});

router.get('/export', requirePermission('reviews:export'), async (req, res, next) => {
  try {
    const format = req.query.format || 'csv';
    const listQuery = parseReviewListQuery({ ...req.query, page: 1, limit: 5000 });
    const exportFilters = { ...listQuery, page: 1, limit: 5000 };

    let exportCount = 0;
    if (format === 'csv') {
      const csvBody = await buildFilteredReviewExportCsv(
        (opts) => reviewRepository.findReviews(opts),
        exportFilters,
      );
      exportCount = Math.max(0, csvBody.split('\n').filter((line) => line && !line.startsWith('PIVOT_')).length - 1);

      await writeAuditLog(req, {
        action: 'REVIEWS_EXPORTED',
        resource: 'reviews',
        details: { format, filters: exportFilters, approximateRows: exportCount },
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="reviews-export.csv"');
      return res.send(`\uFEFF${csvBody}`);
    }

    const data = await reviewRepository.findReviews(exportFilters);
    exportCount = data.reviews.length;

    await writeAuditLog(req, {
      action: 'REVIEWS_EXPORTED',
      resource: 'reviews',
      details: { format, count: exportCount, filters: exportFilters },
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="reviews-export.json"');
    res.json(data.reviews);
  } catch (err) {
    next(err);
  }
});

router.put('/:uniqueId', requirePermission('reviews:write'), async (req, res, next) => {
  try {
    const { uniqueId } = req.params;
    const {
      status,
      resolution,
      department,
      priority,
      category,
      subcategory,
      response_timestamp,
      developer_reply_text,
      developer_reply_time,
      review_link,
    } = req.body;

    const existing = await reviewRepository.findReviews({ search: uniqueId, limit: 1 });
    if (!existing.reviews || existing.reviews.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const current = existing.reviews[0];
    const taxonomy = await loadTaxonomy();
    const merged = {
      category: category !== undefined && category !== null ? category : current.category,
      subcategory: subcategory !== undefined && subcategory !== null ? subcategory : current.subcategory,
      priority: priority !== undefined && priority !== null ? priority : current.priority,
      status: status !== undefined && status !== null ? status : current.status,
    };
    const validation = validateReviewFields(taxonomy, merged);
    if (!validation.ok) {
      throw new ValidationError(validation.errors.join(' '));
    }

    const updated = await reviewRepository.upsertReview({
      ...current,
      status: validation.normalized.status,
      resolution: resolution !== undefined ? resolution : current.resolution,
      department: department !== undefined && department !== null ? department : current.department,
      priority: validation.normalized.priority,
      category: validation.normalized.category,
      subcategory: validation.normalized.subcategory,
      response_timestamp:
        response_timestamp !== undefined ? response_timestamp : current.response_timestamp,
      developer_reply_text:
        developer_reply_text !== undefined ? developer_reply_text : current.developer_reply_text,
      developer_reply_time:
        developer_reply_time !== undefined ? developer_reply_time : current.developer_reply_time,
      review_link: review_link !== undefined ? review_link : current.review_link,
    });

    await writeAuditLog(req, {
      action: 'REVIEW_UPDATED',
      resource: uniqueId,
      details: {
        before: {
          status: current.status,
          priority: current.priority,
          category: current.category,
          subcategory: current.subcategory,
          department: current.department,
          resolution: current.resolution,
        },
        after: {
          status: updated.status,
          priority: updated.priority,
          category: updated.category,
          subcategory: updated.subcategory,
          department: updated.department,
          resolution: updated.resolution,
        },
      },
    });

    res.json({ success: true, review: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
