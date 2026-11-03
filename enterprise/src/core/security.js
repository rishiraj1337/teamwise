'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const BCRYPT_SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

function generateToken(payload, options = {}) {
  const secret = env.JWT_SECRET;
  const expiresIn = options.expiresIn || env.JWT_EXPIRES_IN;
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token) {
  const secret = env.JWT_SECRET;
  return jwt.verify(token, secret);
}

function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Compliance helper: Masks sensitive Personal Identifiable Information (PII)
 * such as email addresses, phone numbers, credit card numbers.
 */
function maskPII(text) {
  if (typeof text !== 'string') return text;

  // Mask email addresses (e.g., j***e@domain.com)
  let sanitized = text.replace(
    /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g,
    '$1***@$2'
  );

  // Mask credit card numbers (13-16 digits with optional spaces or dashes)
  sanitized = sanitized.replace(
    /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    '****-****-****-****'
  );

  // Mask phone numbers (10 digits or with international prefix)
  sanitized = sanitized.replace(
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    '***-***-****'
  );

  return sanitized;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateRandomToken,
  maskPII,
};
