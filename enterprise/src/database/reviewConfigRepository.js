'use strict';

const { getPool } = require('./connection');
const { loadTaxonomy } = require('./taxonomyRepository');

async function listReviewConfig(includeInactive = true) {
  const pool = getPool();
  const activeOnly = includeInactive ? '' : 'WHERE is_active = 1';

  const [priorityRows] = await pool.query(
    'SELECT id, name, is_active FROM review_priority ORDER BY id ASC',
  );
  const [categoryRows] = await pool.query(
    `SELECT id, name, is_active FROM review_category ${activeOnly} ORDER BY name ASC`,
  );
  const [subRows] = await pool.query(
    `SELECT id, category_id, name, is_active FROM review_subcategory ${activeOnly} ORDER BY name ASC`,
  );

  const subByCategory = {};
  for (const sub of subRows) {
    if (!subByCategory[sub.category_id]) subByCategory[sub.category_id] = [];
    subByCategory[sub.category_id].push({
      id: sub.id,
      name: sub.name,
      is_active: Boolean(sub.is_active),
    });
  }

  return {
    priorities: priorityRows.map((row) => ({
      id: row.id,
      name: row.name,
      is_active: Boolean(row.is_active),
    })),
    categories: categoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      is_active: Boolean(row.is_active),
      subcategories: subByCategory[row.id] || [],
    })),
  };
}

async function createCategory(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required');
  const pool = getPool();
  try {
    const [result] = await pool.query(
      'INSERT INTO review_category (name, is_active) VALUES (?, 1)',
      [trimmed],
    );
    return { id: result.insertId, name: trimmed, is_active: true, subcategories: [] };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new Error('Category already exists');
    throw err;
  }
}

async function updateCategory(categoryId, { name, is_active: isActive } = {}) {
  const pool = getPool();
  const [existing] = await pool.query('SELECT id, name, is_active FROM review_category WHERE id = ?', [
    categoryId,
  ]);
  if (existing.length === 0) throw new Error('Category not found');

  const nextName = name !== undefined ? String(name).trim() : existing[0].name;
  const nextActive = isActive !== undefined ? (isActive ? 1 : 0) : existing[0].is_active;

  try {
    await pool.query('UPDATE review_category SET name = ?, is_active = ? WHERE id = ?', [
      nextName,
      nextActive,
      categoryId,
    ]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new Error('Category name already in use');
    throw err;
  }

  await loadTaxonomy(true);
  return { id: Number(categoryId), name: nextName, is_active: Boolean(nextActive), subcategories: [] };
}

async function createSubcategory(categoryId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Subcategory name is required');
  const pool = getPool();
  const [cat] = await pool.query('SELECT id FROM review_category WHERE id = ?', [categoryId]);
  if (cat.length === 0) throw new Error('Category not found');
  try {
    const [result] = await pool.query(
      'INSERT INTO review_subcategory (category_id, name, is_active) VALUES (?, ?, 1)',
      [categoryId, trimmed],
    );
    await loadTaxonomy(true);
    return { id: result.insertId, name: trimmed, is_active: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new Error('Subcategory already exists for this category');
    throw err;
  }
}

async function updateSubcategory(subcategoryId, { name, is_active: isActive } = {}) {
  const pool = getPool();
  const [existing] = await pool.query(
    'SELECT id, name, is_active, category_id FROM review_subcategory WHERE id = ?',
    [subcategoryId],
  );
  if (existing.length === 0) throw new Error('Subcategory not found');

  const nextName = name !== undefined ? String(name).trim() : existing[0].name;
  const nextActive = isActive !== undefined ? (isActive ? 1 : 0) : existing[0].is_active;

  try {
    await pool.query('UPDATE review_subcategory SET name = ?, is_active = ? WHERE id = ?', [
      nextName,
      nextActive,
      subcategoryId,
    ]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new Error('Subcategory name already in use');
    throw err;
  }

  await loadTaxonomy(true);
  return { id: Number(subcategoryId), name: nextName, is_active: Boolean(nextActive) };
}

module.exports = {
  listReviewConfig,
  createCategory,
  updateCategory,
  createSubcategory,
  updateSubcategory,
};
