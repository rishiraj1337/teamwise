'use strict';

const { getPool } = require('./connection');
const { generateRandomToken } = require('../core/security');

class InviteRepository {
  async createInvite({ email, role, invitedBy = null, expiresInHours = 48 }) {
    const pool = getPool();
    const token = generateRandomToken(32);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const [result] = await pool.query(
      `INSERT INTO user_invites (email, role, token, status, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, 'PENDING', ?, ?, NOW(3))`,
      [email.trim().toLowerCase(), role, token, invitedBy, expiresAt]
    );

    return {
      id: result.insertId,
      email: email.trim().toLowerCase(),
      role,
      token,
      expiresAt,
    };
  }

  async findByToken(token) {
    if (!token) return null;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, email, role, token, status, invited_by, expires_at, created_at, accepted_at
       FROM user_invites
       WHERE token = ? LIMIT 1`,
      [token]
    );
    return rows[0] || null;
  }

  async markAccepted(id) {
    const pool = getPool();
    await pool.query(
      "UPDATE user_invites SET status = 'ACCEPTED', accepted_at = NOW(3) WHERE id = ?",
      [id]
    );
  }

  async revokeInvite(id) {
    const pool = getPool();
    await pool.query(
      "UPDATE user_invites SET status = 'REVOKED' WHERE id = ?",
      [id]
    );
  }

  async listInvites({ limit = 50, offset = 0 } = {}) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT i.id, i.email, i.role, i.token, i.status, i.expires_at, i.created_at, i.accepted_at,
              u.email AS invited_by_email
       FROM user_invites i
       LEFT JOIN users u ON i.invited_by = u.id
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [Number(limit), Number(offset)]
    );

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM user_invites');
    return {
      invites: rows,
      total: Number(countRows[0].total),
    };
  }
}

const inviteRepository = new InviteRepository();

module.exports = {
  InviteRepository,
  inviteRepository,
};
