'use strict';

const { getPool } = require('./connection');

let cachedTaxonomy = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

const DEFAULT_PRIORITIES = Object.freeze(['Low', 'Medium', 'High', 'Urgent']);
const DEFAULT_STATUSES = Object.freeze(['New', 'In Progress', 'Resolved', 'Closed', 'N/A']);
const DEFAULT_CATEGORIES = Object.freeze([
  'Playstore review',
  'Status Enquiry',
  'Technical',
  'UPI Lite',
  'Chatbot Complaint',
  'P2P_RaiseComplaint',
  'P2M_RaiseComplaint',
  'Credit_Card',
  'Mobile_Prepaid',
  'Electricity',
  'DTH',
  'Fastag',
  'Loan Repayment',
  'Insurance',
]);

const DEFAULT_SUBCATEGORIES = Object.freeze({
  'Playstore review': ['Positive', 'Negative'],
  'Status Enquiry': [
    'Refund Not Received',
    'Success',
    'Failed',
    'Elaborate',
    'Irrelevant',
    'Legal',
    'CC Bill payment navigation assistance',
  ],
  Technical: [
    'registration',
    'Account Blocked due to Suspicious activity',
    'Performance related',
    'BBPS dashboard query',
    'Bank balance check not working',
    'Elaborate',
    'Account deletion',
    'Device Integrity failed',
    'SIM select error',
    'Mobile number not received error',
    'Proceed to Pay issue',
    'Compatibility issue - Android below 13',
    'Unable to make payment for Slice Credit card bill',
    'Transaction failed - Reason for failure',
    'iOS registration issue',
    'Login issue',
    'We are facing come issue at our end error',
    'Unable to add Slice bank account',
    'OTP issue',
    'CC not showing up for Electricity bill payment',
    'Transaction Blocked Due to Security Verification error',
    'Reward not recorded on the Trx History page',
  ],
  'UPI Lite': [
    'Lite wallet disappeared and Unable to top-up the bal',
    'Amount not added to Lite account',
    'Elaborate',
    'Risk threshold exceeded error',
    'Unable to activate Lite wallet',
  ],
  'Chatbot Complaint': ['General', 'N/A', 'BBPS', 'P2M', 'P2P'],
  P2P_RaiseComplaint: ['P2P', 'General', 'N/A'],
  P2M_RaiseComplaint: ['P2M', 'General', 'N/A'],
  Credit_Card: ['BBPS', 'General', 'N/A'],
  Mobile_Prepaid: ['BBPS', 'General', 'N/A'],
  Electricity: ['BBPS', 'General'],
  DTH: ['BBPS', 'General'],
  Fastag: ['BBPS', 'General'],
  'Loan Repayment': ['BBPS', 'General'],
  Insurance: ['BBPS', 'General'],
});

async function loadTaxonomy(force = false) {
  const now = Date.now();
  if (!force && cachedTaxonomy && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedTaxonomy;
  }

  const pool = getPool();
  let priorities = [...DEFAULT_PRIORITIES];
  let statuses = [...DEFAULT_STATUSES];
  let categories = [...DEFAULT_CATEGORIES];
  let subcategories = { ...DEFAULT_SUBCATEGORIES };

  try {
    const [priorityRows] = await pool.query(
      'SELECT name FROM review_priority WHERE is_active = 1 ORDER BY id ASC',
    );
    if (priorityRows.length > 0) {
      priorities = priorityRows.map((row) => row.name);
    }

    const [statusRows] = await pool.query(
      'SELECT name FROM review_status WHERE is_active = 1 ORDER BY sort_order ASC, id ASC',
    );
    if (statusRows.length > 0) {
      statuses = statusRows.map((row) => row.name);
    }

    const [categoryRows] = await pool.query(
      'SELECT id, name FROM review_category WHERE is_active = 1 ORDER BY name ASC',
    );
    if (categoryRows.length > 0) {
      categories = categoryRows.map((row) => row.name);
      const [subRows] = await pool.query(
        `SELECT c.name AS category_name, s.name AS subcategory_name
         FROM review_subcategory s
         INNER JOIN review_category c ON c.id = s.category_id
         WHERE s.is_active = 1 AND c.is_active = 1
         ORDER BY c.name ASC, s.name ASC`,
      );
      subcategories = {};
      for (const row of subRows) {
        if (!subcategories[row.category_name]) {
          subcategories[row.category_name] = [];
        }
        subcategories[row.category_name].push(row.subcategory_name);
      }
    }
  } catch (err) {
    // Tables may not exist yet during first boot; fall back to defaults.
  }

  cachedTaxonomy = {
    priorities,
    statuses,
    categories,
    subcategories,
  };
  cacheLoadedAt = now;
  return cachedTaxonomy;
}

function normalizeStatus(status) {
  const trimmed = String(status || '').trim();
  const lowered = trimmed.toLowerCase();
  if (!trimmed || lowered === 'n/a') return 'N/A';
  if (lowered === 'new' || lowered === 'open' || lowered === 'pending') return 'New';
  if (lowered === 'in progress' || lowered === 'in_progress' || lowered === 'inprogress') {
    return 'In Progress';
  }
  if (lowered === 'resolved' || lowered === 'done' || lowered === 'complete') return 'Resolved';
  if (lowered === 'closed') return 'Closed';
  return trimmed;
}

function validateReviewFields(taxonomy, fields) {
  const errors = [];
  const category = String(fields.category || '').trim();
  const subcategory = String(fields.subcategory || '').trim();
  const priority = String(fields.priority || '').trim();
  const status = normalizeStatus(fields.status);

  if (!taxonomy.categories.includes(category)) {
    errors.push(`Invalid category: ${category}`);
  } else {
    const subs = taxonomy.subcategories[category] || [];
    if (subs.length > 0 && !subs.includes(subcategory)) {
      errors.push(`Invalid subcategory "${subcategory}" for category "${category}"`);
    }
  }

  if (!taxonomy.priorities.includes(priority)) {
    errors.push(`Invalid priority: ${priority}`);
  }

  if (!taxonomy.statuses.includes(status)) {
    errors.push(`Invalid status: ${status}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: { category, subcategory, priority, status },
  };
}

async function ensureCategorySubcategory(categoryName, subcategoryName) {
  const category = String(categoryName || '').trim();
  let subcategory = String(subcategoryName || '').trim();
  if (!category || category === 'N/A') {
    return null;
  }
  if (!subcategory) {
    subcategory = 'N/A';
  }

  const pool = getPool();
  await pool.query(
    'INSERT INTO review_category (name, is_active) VALUES (?, 1) ON DUPLICATE KEY UPDATE is_active = 1',
    [category],
  );
  const [catRows] = await pool.query('SELECT id FROM review_category WHERE name = ? LIMIT 1', [category]);
  const categoryId = catRows[0]?.id;
  if (!categoryId) {
    return null;
  }

  let subcategoryId = null;
  if (subcategory !== 'N/A') {
    await pool.query(
      `INSERT INTO review_subcategory (category_id, name, is_active) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [categoryId, subcategory],
    );
    const [subRows] = await pool.query(
      'SELECT id FROM review_subcategory WHERE category_id = ? AND name = ? LIMIT 1',
      [categoryId, subcategory],
    );
    subcategoryId = subRows[0]?.id ?? null;
  }

  cachedTaxonomy = null;
  cacheLoadedAt = 0;
  return { categoryId, subcategoryId };
}

module.exports = {
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
  DEFAULT_CATEGORIES,
  DEFAULT_SUBCATEGORIES,
  loadTaxonomy,
  normalizeStatus,
  validateReviewFields,
  ensureCategorySubcategory,
};
