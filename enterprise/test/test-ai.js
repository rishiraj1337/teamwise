'use strict';

const assert = require('assert');
const { heuristicClassify } = require('../src/ai/heuristicClassifier');
const { buildExtractionSystemPrompt, buildUserPrompt } = require('../src/ai/promptBuilder');
const { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES } = require('../src/config/constants');

console.log('Running AI Layer Tests...');

// Test 1: Heuristic sentiment and star rating detection
const negativeEmail = {
  subject: 'Disaster! Money deducted from account but wallet empty',
  bodyText: 'This app is terrible! Worst service ever. I got charged 500 rupees but money not credited. Fix this ASAP or I am reporting fraud.',
  importance: 'high',
};

const resultNegative = heuristicClassify(negativeEmail, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES);
assert.strictEqual(resultNegative.star_ratings, 1, 'Negative review should have 1 star rating');
assert.strictEqual(resultNegative.priority, 'Urgent', 'High urgency text should yield Urgent priority');
assert.strictEqual(resultNegative.category, 'Status Enquiry', 'Payment keywords should map to Status Enquiry');
assert(DEFAULT_CATEGORIES.includes(resultNegative.category), 'Category must be in allowed enums');

console.log('Passed: Negative email classified correctly with 1-star, Urgent priority, Status Enquiry category.');

// Test 2: Positive praise email
const positiveEmail = {
  subject: 'Awesome app!',
  bodyText: 'I love using TimePay! It is fantastic and super smooth. Thank you so much team.',
  importance: 'normal',
};

const resultPositive = heuristicClassify(positiveEmail, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES);
assert.strictEqual(resultPositive.star_ratings, 5, 'Glowing praise should have 5 star rating');
assert.strictEqual(resultPositive.priority, 'Medium', 'Praise should have Medium priority');
console.log('Passed: Positive email classified with 5-star rating.');

// Test 3: Prompt builder adheres to categories and subcategories
const prompt = buildExtractionSystemPrompt(['Billing & Payment', 'Stability & Crash'], { 'Billing & Payment': ['Refund'] });
assert(prompt.includes('Billing & Payment'), 'System prompt contains custom category');
assert(prompt.includes('Refund'), 'System prompt contains custom subcategory');
console.log('Passed: Prompt builder correctly injects dynamic categories and subcategories.');

console.log('All AI Layer tests passed successfully!');
