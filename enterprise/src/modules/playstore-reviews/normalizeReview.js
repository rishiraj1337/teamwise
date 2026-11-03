'use strict';

const {
  PLAYSTORE_CHANNEL,
  applyPlaystoreClassificationFields,
  playstoreDepartmentName,
  playstorePriorityName,
  playstoreSubcategoryName,
} = require('./playstoreClassification');
const { truncateUtf8 } = require('../../core/stringUtil');

const REVIEW_LINK_MAX_BYTES = 512;

function normalizeReview(review) {
  if (!review || typeof review !== 'object') {
    throw new Error('Raw review must be an object');
  }

  const sourceReviewId = String(review.reviewId || review.id || '').trim();
  if (!sourceReviewId) {
    throw new Error('Review missing valid source identifier');
  }

  const rating = Number(review.score ?? review.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error(`Review ${sourceReviewId} has an invalid rating: ${review.score ?? review.rating}`);
  }

  const timestamp = review.publishedAt || review.date;
  const publishedAt = new Date(timestamp);
  if (!timestamp || Number.isNaN(publishedAt.getTime())) {
    throw new Error(`Review ${sourceReviewId} has an invalid timestamp: ${timestamp}`);
  }

  const appVersionCode = review.appVersionCode || review.versionCode;
  const appVersionName = review.appVersion || review.version;

  let developerReplyTime = null;
  if (review.replyDate) {
    const d = new Date(review.replyDate);
    if (!Number.isNaN(d.getTime())) {
      developerReplyTime = d;
    }
  }

  const normalized = {
    sourceReviewId,
    rating,
    channel: PLAYSTORE_CHANNEL,
    appVersionCode:
      appVersionCode !== undefined && appVersionCode !== null ? String(appVersionCode) : 'N/A',
    appVersionName:
      appVersionName !== undefined && appVersionName !== null ? String(appVersionName) : 'N/A',
    reviewTimestamp: publishedAt,
    reviewText: typeof review.text === 'string' ? review.text : 'N/A',
    category: 'Playstore review',
    subcategory: playstoreSubcategoryName(rating),
    priority: playstorePriorityName(rating),
    status: 'New',
    resolution: 'N/A',
    department: playstoreDepartmentName(rating),
    responseTimestamp: null,
    resolutionDate: null,
    developerReplyTime,
    developerReplyText: typeof review.replyText === 'string' ? review.replyText : 'N/A',
    reviewLink: truncateUtf8(typeof review.url === 'string' ? review.url : 'N/A', REVIEW_LINK_MAX_BYTES) || 'N/A',
  };

  return applyPlaystoreClassificationFields(normalized);
}

function normalizeReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  const valid = [];
  for (const r of reviews) {
    try {
      valid.push(normalizeReview(r));
    } catch (e) {
      // Skip invalid scraper rows
    }
  }
  return valid;
}

module.exports = {
  normalizeReview,
  normalizeReviews,
  playstorePriorityName,
  playstoreSubcategoryName,
};
