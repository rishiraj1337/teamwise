'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const { writeAuditLog } = require('../../core/auditLog');
const {
  listReviewConfig,
  createCategory,
  updateCategory,
  createSubcategory,
  updateSubcategory,
} = require('../../database/reviewConfigRepository');
const { ValidationError } = require('../../core/errors');

router.use(authenticate);
router.use(requirePermission('settings:read'));

router.get('/', async (req, res, next) => {
  try {
    const config = await listReviewConfig(true);
    res.json({ success: true, ...config });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const category = await createCategory(req.body?.name);
    await writeAuditLog(req, {
      action: 'REVIEW_CONFIG_CATEGORY_CREATE',
      resource: String(category.id),
      details: { name: category.name },
    });
    res.status(201).json({ success: true, ...category });
  } catch (err) {
    if (err.message.includes('already exists')) {
      return next(new ValidationError(err.message));
    }
    next(err);
  }
});

router.patch('/categories/:categoryId', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const category = await updateCategory(Number(req.params.categoryId), req.body || {});
    await writeAuditLog(req, {
      action: 'REVIEW_CONFIG_CATEGORY_UPDATE',
      resource: String(category.id),
      details: req.body,
    });
    res.json({ success: true, ...category });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('in use')) {
      return next(new ValidationError(err.message));
    }
    next(err);
  }
});

router.post('/categories/:categoryId/subcategories', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const subcategory = await createSubcategory(Number(req.params.categoryId), req.body?.name);
    await writeAuditLog(req, {
      action: 'REVIEW_CONFIG_SUBCATEGORY_CREATE',
      resource: String(subcategory.id),
      details: { category_id: Number(req.params.categoryId), name: subcategory.name },
    });
    res.status(201).json({ success: true, ...subcategory });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('already exists')) {
      return next(new ValidationError(err.message));
    }
    next(err);
  }
});

router.patch('/subcategories/:subcategoryId', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const subcategory = await updateSubcategory(Number(req.params.subcategoryId), req.body || {});
    await writeAuditLog(req, {
      action: 'REVIEW_CONFIG_SUBCATEGORY_UPDATE',
      resource: String(subcategory.id),
      details: req.body,
    });
    res.json({ success: true, ...subcategory });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('in use')) {
      return next(new ValidationError(err.message));
    }
    next(err);
  }
});

module.exports = router;
