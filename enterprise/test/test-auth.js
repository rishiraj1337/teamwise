'use strict';

const assert = require('assert');
const { hashPassword, verifyPassword, generateToken, verifyToken, maskPII } = require('../src/core/security');
const { ROLES, ROLE_PERMISSIONS } = require('../src/config/constants');

async function runAuthTests() {
  console.log('Running Authentication and Security Tests...');

  // Test 1: Password Hashing & Verification
  const plain = 'StrongSecretPass123!';
  const hash = await hashPassword(plain);
  assert(hash !== plain, 'Password hash must not match plain text');
  const valid = await verifyPassword(plain, hash);
  assert.strictEqual(valid, true, 'Verification of correct password must return true');
  const invalid = await verifyPassword('WrongPassword', hash);
  assert.strictEqual(invalid, false, 'Verification of wrong password must return false');
  console.log('Passed: Password hashing and verification working correctly.');

  // Test 2: JWT Issuance and Verification
  const payload = { id: 42, email: 'admin@company.com', role: ROLES.ADMIN };
  const token = generateToken(payload, { expiresIn: '1h' });
  assert(typeof token === 'string' && token.length > 20, 'JWT token must be a non-empty string');
  const decoded = verifyToken(token);
  assert.strictEqual(decoded.id, 42, 'Decoded token ID matches');
  assert.strictEqual(decoded.email, 'admin@company.com', 'Decoded token email matches');
  assert.strictEqual(decoded.role, ROLES.ADMIN, 'Decoded token role matches');
  console.log('Passed: JWT token issuance and signature verification working correctly.');

  // Test 3: RBAC Permissions mapping
  assert(ROLE_PERMISSIONS.ADMIN.includes('users:manage_rbac'), 'ADMIN role must have users:manage_rbac permission');
  assert(!ROLE_PERMISSIONS.VIEWER.includes('users:manage_rbac'), 'VIEWER role must NOT have users:manage_rbac permission');
  console.log('Passed: RBAC permissions correctly mapped.');

  // Test 4: Compliance PII Masking
  const rawFeedback = 'Please contact me at customer.john@example.com or call +1 555-123-4567. Card used: 4111 2222 3333 4444.';
  const masked = maskPII(rawFeedback);
  assert(!masked.includes('customer.john@example.com'), 'Email address must be masked');
  assert(!masked.includes('555-123-4567'), 'Phone number must be masked');
  assert(!masked.includes('4111 2222 3333 4444'), 'Credit card must be masked');
  console.log('Passed: PII masking removes sensitive emails, phones, and cards.');

  console.log('All Authentication and Security tests passed successfully!');
}

runAuthTests().catch((err) => {
  console.error('Auth test failed:', err);
  process.exit(1);
});
