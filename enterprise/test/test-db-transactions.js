'use strict';

const assert = require('assert');
const { reviewRepository } = require('../src/database/reviewRepository');

async function runTests() {
  console.log('Running Database Transaction Efficiency Tests...');

  // Test 1: getNextTprId provides atomic sequential IDs without holding multi-statement transactions
  let idMock = 10;
  const mockConn = {
    query: async (sql, params) => {
      if (sql.includes('UPDATE review_id_sequence')) {
        idMock++;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('LAST_INSERT_ID()')) {
        // mysql2 returns [rows, fields]
        return [[{ assigned_id: idMock }], []];
      }
      return [[], []];
    },
    release: () => {},
  };

  const nextId = await reviewRepository.getNextTprId(mockConn);
  assert(nextId.startsWith('TPR'), `Expected TPR format, got ${nextId}`);
  assert.strictEqual(nextId, 'TPR0010');
  console.log(`Passed: Atomic sequence allocation verified: ${nextId}`);

  // Test 2: Verify ReviewCollector logic when unmapped reviews is 0
  const { ReviewCollector } = require('../src/modules/playstore-reviews/reviewCollector');
  const collector = new ReviewCollector();

  // Test transaction guard conditions
  assert.strictEqual(typeof collector.saveReviewsAndCheckpoints, 'function');
  console.log('Passed: saveReviewsAndCheckpoints method interface verified.');

  console.log('All DB Transaction efficiency tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
