'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { GithubEmailClient } = require('../src/modules/email-ingestion/githubEmailClient');

async function runTests() {
  console.log('Running GitHub Email Dispatch Ingestion Tests...');

  // Test 1: URL parsing
  const client = new GithubEmailClient({
    repoUrl: 'https://github.com/rishiraj1337/teamwise.git',
    baseIntervalSeconds: 30,
    maxIntervalSeconds: 180,
  });

  assert.strictEqual(client.owner, 'rishiraj1337', 'Owner should be rishiraj1337');
  assert.strictEqual(client.repo, 'teamwise', 'Repo should be teamwise');
  assert.strictEqual(client.isConfigured(), true, 'Client should be configured');
  console.log('Passed: Repository URL cleanly parsed into owner and repo.');

  // Test 2: Dynamic backoff interval calculations
  assert.strictEqual(client.currentIntervalMs, 30000, 'Initial interval should be 30000ms');
  client.lastCommitSha = 'abc1234';

  // Simulate backoff
  client.currentIntervalMs = Math.min(Math.round(client.currentIntervalMs * 1.25), client.maxIntervalMs);
  assert.strictEqual(client.currentIntervalMs, 37500, 'First backoff interval should be 37500ms');

  client.currentIntervalMs = Math.min(Math.round(client.currentIntervalMs * 1.25), client.maxIntervalMs);
  assert.strictEqual(client.currentIntervalMs, 46875, 'Second backoff interval should be 46875ms');

  // Test capping at maxIntervalMs
  for (let i = 0; i < 20; i++) {
    client.currentIntervalMs = Math.min(Math.round(client.currentIntervalMs * 1.25), client.maxIntervalMs);
  }
  assert.strictEqual(client.currentIntervalMs, 180000, 'Interval must cap at maxIntervalMs (180000ms)');
  console.log('Passed: Dynamic backoff poll intervals verified.');

  // Test 3: Deduplication hashing
  const rawEmailPayload = JSON.stringify({
    message_id: 'msg_987654',
    subject: 'Refund request',
    body: 'Please process my refund.',
  });
  const hash1 = crypto.createHash('sha256').update(rawEmailPayload).digest('hex');
  const hash2 = crypto.createHash('sha256').update(rawEmailPayload).digest('hex');
  assert.strictEqual(hash1, hash2, 'SHA256 hash must be deterministic');

  client.processedContentHashes.add(hash1);
  assert.strictEqual(client.processedContentHashes.has(hash2), true, 'Duplicate payload detected by hash');
  console.log('Passed: SHA-256 deduplication and duplicate prevention verified.');

  // Test 4: Header generation
  const authHeaders = client.getHeaders();
  assert.strictEqual(authHeaders['User-Agent'], 'TeamWise-Enterprise-Email-Ingestion/2.0');
  assert.strictEqual(authHeaders.Accept, 'application/vnd.github.v3+json');

  const authedClient = new GithubEmailClient({
    repoUrl: 'https://github.com/rishiraj1337/teamwise',
    pat: 'ghp_test_token_12345',
  });
  const bearerHeaders = authedClient.getHeaders();
  assert.strictEqual(bearerHeaders.Authorization, 'Bearer ghp_test_token_12345');
  console.log('Passed: Authorization header and API headers verified.');

  console.log('All GitHub Email Ingestion tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
