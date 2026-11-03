'use strict';

const assert = require('assert');
const {
  playstorePriorityName,
  playstoreSubcategoryName,
  playstoreDepartmentName,
  applyPlaystoreClassificationFields,
} = require('../src/modules/playstore-reviews/playstoreClassification');

assert.strictEqual(playstorePriorityName(1), 'Medium');
assert.strictEqual(playstorePriorityName(2), 'Medium');
assert.strictEqual(playstorePriorityName(3), 'Low');
assert.strictEqual(playstoreSubcategoryName(3), 'Negative');
assert.strictEqual(playstoreSubcategoryName(4), 'Positive');
assert.strictEqual(playstoreDepartmentName(2), 'Engineering');
assert.strictEqual(playstoreDepartmentName(5), 'Customer Support');

const row = applyPlaystoreClassificationFields({ rating: 1 });
assert.strictEqual(row.category, 'Playstore review');
assert.strictEqual(row.priority, 'Medium');
assert.strictEqual(row.status, 'New');

console.log('playstore classification rules: ok');
