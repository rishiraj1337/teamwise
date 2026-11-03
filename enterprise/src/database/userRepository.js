'use strict';

const { getPool } = require('./connection');
const { ROLES } = require('../config/constants');
const { hashPassword } = require('../core/security');

class UserRepository {
  async findByEmail(email) {
    if (!email) return null;
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, name, role, status, last_login_at, created_at, updated_at FROM users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );
    return rows[0] || null;
  }

  async findById(id) {
    if (!id) return null;
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, name, role, status, last_login_at, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  async createUser({ email, password, name = 'User', role = ROLES.VIEWER }) {
    const pool = getPool();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))`,
      [normalizedEmail, passwordHash, name, role]
    );

    return {
      id: result.insertId,
      email: normalizedEmail,
      name,
      role,
      status: 'ACTIVE',
    };
  }

  async updateRole(id, role) {
    if (!Object.values(ROLES).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    const pool = getPool();
    await pool.query(
      'UPDATE users SET role = ?, updated_at = NOW(3) WHERE id = ?',
      [role, id]
    );
    return this.findById(id);
  }

  async updateStatus(id, status) {
    const pool = getPool();
    await pool.query(
      'UPDATE users SET status = ?, updated_at = NOW(3) WHERE id = ?',
      [status, id]
    );
    return this.findById(id);
  }

  async updateLastLogin(id) {
    const pool = getPool();
    await pool.query(
      'UPDATE users SET last_login_at = NOW(3) WHERE id = ?',
      [id]
    );
  }

  async listUsers({ limit = 100, offset = 0 } = {}) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, email, name, role, status, last_login_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    );

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    return {
      users: rows,
      total: Number(countRows[0].total),
    };
  }

  async countUsers() {
    const pool = getPool();
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users');
    return Number(rows[0].total);
  }
}

const userRepository = new UserRepository();

module.exports = {
  UserRepository,
  userRepository,
};
