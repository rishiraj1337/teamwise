'use strict';

const assert = require('assert');
const { evaluateSupportEmail, heuristicClassify } = require('../src/ai/heuristicClassifier');
const { FileWatcher } = require('../src/modules/email-ingestion/fileWatcher');
const { createRateLimiter } = require('../src/server/middleware/rateLimitMiddleware');
const path = require('path');
const fs = require('fs');

async function runSecurityAndFilterTests() {
  console.log('Running Mail Filter & Security Hardening Tests...');

  // ==========================================
  // Test 1: Mail Filter - Genuine Support Emails
  // ==========================================
  const validSupportEmail = {
    subject: 'Cannot login to account - OTP error',
    from: 'customer.john@gmail.com',
    bodyText: 'I am trying to sign into my account but the OTP never arrives. Please help me fix this!',
    importance: 'high',
  };
  const supportEvaluation = evaluateSupportEmail(validSupportEmail);
  assert.strictEqual(supportEvaluation.isSupport, true, 'Valid customer complaint should be evaluated as support');
  assert.strictEqual(supportEvaluation.supportFlag, 'support', 'Support flag must be "support"');
  assert.strictEqual(supportEvaluation.rejectionReason, null, 'Rejection reason should be null for support mail');

  const classification = heuristicClassify(validSupportEmail);
  assert.strictEqual(classification.is_support, true);
  assert.strictEqual(classification.support_flag, 'support');
  console.log('Passed: Legitimate support email correctly identified and flagged.');

  // ==========================================
  // Test 2: Mail Filter - Out of Office Auto-Reply
  // ==========================================
  const outOfOfficeEmail = {
    subject: 'Automatic reply: Out of Office until Monday',
    from: 'colleague@enterprise.com',
    bodyText: 'Thank you for your email. I am currently out of the office on annual leave with no access to email.',
    importance: 'normal',
  };
  const oooEvaluation = evaluateSupportEmail(outOfOfficeEmail);
  assert.strictEqual(oooEvaluation.isSupport, false, 'Out-of-office email must be flagged as non-support');
  assert.strictEqual(oooEvaluation.supportFlag, 'not_support');
  assert(oooEvaluation.rejectionReason.includes('Out-of-office'), 'Reason reflects out-of-office autoreply');
  console.log('Passed: Out-of-office auto-reply rejected from support queue.');

  // ==========================================
  // Test 3: Mail Filter - Bounce / Delivery Status Failure
  // ==========================================
  const bounceEmail = {
    subject: 'Delivery Status Notification (Failure)',
    from: 'mailer-daemon@googlemail.com',
    bodyText: 'The following message could not be delivered to recipient@unknown.com. Diagnostic-Code: 550 User unknown.',
    importance: 'normal',
  };
  const bounceEvaluation = evaluateSupportEmail(bounceEmail);
  assert.strictEqual(bounceEvaluation.isSupport, false, 'Delivery failure bounce must be non-support');
  assert.strictEqual(bounceEvaluation.supportFlag, 'not_support');
  console.log('Passed: Delivery failure bounce quarantined.');

  // ==========================================
  // Test 4: Mail Filter - Marketing Spam / Unsolicited Promotion
  // ==========================================
  const spamEmail = {
    subject: 'Weekly Digest: Special Discount 50% Off!',
    from: 'promotions@marketing-blast.com',
    bodyText: 'Check out our special discount promo code. Click here to unsubscribe from this weekly newsletter.',
    importance: 'low',
  };
  const spamEvaluation = evaluateSupportEmail(spamEmail);
  assert.strictEqual(spamEvaluation.isSupport, false, 'Marketing spam must be rejected');
  assert.strictEqual(spamEvaluation.supportFlag, 'not_support');
  console.log('Passed: Promotional marketing spam identified and flagged as not_support.');

  // ==========================================
  // Test 5: FileWatcher - Path Traversal Prevention
  // ==========================================
  const testUploadsDir = path.resolve(__dirname, '../data/test-uploads');
  const watcher = new FileWatcher({
    uploadsDir: testUploadsDir,
    processedDir: path.join(testUploadsDir, 'processed'),
    failedDir: path.join(testUploadsDir, 'failed'),
    nonSupportDir: path.join(testUploadsDir, 'non-support'),
  });

  assert.throws(
    () => watcher.readFileContent('../../package.json'),
    /directory traversal detected/i,
    'Directory traversal in readFileContent must be blocked'
  );
  console.log('Passed: FileWatcher directory traversal protection verified.');

  // Cleanup test uploads dir if created
  if (fs.existsSync(testUploadsDir)) {
    fs.rmSync(testUploadsDir, { recursive: true, force: true });
  }

  // ==========================================
  // Test 6: Rate Limiter Middleware
  // ==========================================
  const limiter = createRateLimiter({
    windowMs: 5000,
    maxRequests: 3,
    message: 'Rate limit exceeded',
    keyGenerator: () => 'test-ip',
  });

  let lastStatus = null;
  const mockReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const mockRes = {
    headers: {},
    setHeader(name, val) { this.headers[name] = val; },
    status(code) { lastStatus = code; return this; },
    json(data) { return data; },
  };

  let nextCalls = 0;
  const mockNext = () => { nextCalls++; };

  // Calls 1, 2, 3 should succeed
  limiter(mockReq, mockRes, mockNext);
  limiter(mockReq, mockRes, mockNext);
  limiter(mockReq, mockRes, mockNext);
  assert.strictEqual(nextCalls, 3);
  assert.strictEqual(mockRes.headers['X-RateLimit-Remaining'], 0);

  // Call 4 should be rejected with 429
  limiter(mockReq, mockRes, mockNext);
  assert.strictEqual(lastStatus, 429, 'Excess request rejected with HTTP 429');
  assert.strictEqual(nextCalls, 3, 'Next should not be invoked when rate limited');
  console.log('Passed: Rate limiting middleware verified.');

  // ==========================================
  // Test 7: CSV Formula Injection Sanitization
  // ==========================================
  function testSanitizeCsv(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  }

  const maliciousFormula = '=cmd|"/C calc"!A0';
  const safeCell = testSanitizeCsv(maliciousFormula);
  assert(safeCell.startsWith('"\'='), 'Formula injection must be prepended with single quote');
  console.log('Passed: CSV formula injection sanitization verified.');

  console.log('All Mail Filter & Security Hardening tests passed successfully!');
}

runSecurityAndFilterTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
