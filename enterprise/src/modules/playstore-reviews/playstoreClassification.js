'use strict';

/**
 * Canonical Google Play Store ingest rules (formerly playstore-reviews).
 * Keep in sync with documented priority/subcategory/category rules.
 */

const PLAYSTORE_CHANNEL = 'Google Playstore';
const PLAYSTORE_CATEGORY = 'Playstore review';
const PLAYSTORE_DEFAULT_STATUS = 'New';
const PLAYSTORE_DEFAULT_RESOLUTION = 'N/A';

function assertValidRating(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error(`Invalid star rating for Play Store classification: ${rating}`);
  }
}

/** 1–2★ → Medium; 3–5★ → Low */
function playstorePriorityName(rating) {
  assertValidRating(rating);
  return rating <= 2 ? 'Medium' : 'Low';
}

/** 1–3★ → Negative; 4–5★ → Positive */
function playstoreSubcategoryName(rating) {
  assertValidRating(rating);
  return rating <= 3 ? 'Negative' : 'Positive';
}

/** Enterprise operational routing on ingest */
function playstoreDepartmentName(rating) {
  assertValidRating(rating);
  return rating <= 2 ? 'Engineering' : 'Customer Support';
}

function applyPlaystoreClassificationFields(review) {
  const rating = Number(review.rating ?? review.star_ratings);
  assertValidRating(rating);
  review.channel = PLAYSTORE_CHANNEL;
  review.category = PLAYSTORE_CATEGORY;
  review.subcategory = playstoreSubcategoryName(rating);
  review.priority = playstorePriorityName(rating);
  review.status = PLAYSTORE_DEFAULT_STATUS;
  review.resolution = PLAYSTORE_DEFAULT_RESOLUTION;
  review.department = playstoreDepartmentName(rating);
  return review;
}

async function resolvePlaystoreTaxonomyIds(review, connection) {
  const { ensureCategorySubcategory } = require('../../database/taxonomyRepository');
  const queryTarget = connection;
  const ids = await ensureCategorySubcategory(review.category, review.subcategory);
  const [priorityRows] = await queryTarget.query(
    'SELECT id FROM review_priority WHERE name = ? AND is_active = 1 LIMIT 1',
    [review.priority],
  );
  return {
    categoryId: ids?.categoryId ?? null,
    subcategoryId: ids?.subcategoryId ?? null,
    priorityId: priorityRows[0]?.id ?? null,
  };
}

module.exports = {
  PLAYSTORE_CHANNEL,
  PLAYSTORE_CATEGORY,
  PLAYSTORE_DEFAULT_STATUS,
  playstorePriorityName,
  playstoreSubcategoryName,
  playstoreDepartmentName,
  applyPlaystoreClassificationFields,
  resolvePlaystoreTaxonomyIds,
};
