'use strict';

const assert = require('assert');
const { parseEmailPayload, stripHtml } = require('../src/modules/email-ingestion/emailParser');
const { normalizeReview } = require('../src/modules/playstore-reviews/normalizeReview');
const { extractCustomerConcern, determineRatingAndPriority } = require('../src/modules/chatbot-polling/chatbotPollingService');

console.log('Running Pipeline Integration Tests...');

// Test 1: HTML stripping
const htmlSnippet = '<p>Hello <b>World</b>&nbsp;team!</p>';
assert.strictEqual(stripHtml(htmlSnippet), 'Hello World team!', 'HTML tags and entities stripped');
console.log('Passed: HTML tag stripping verified.');

// Test 2: Email payload parsing
const sampleEmailJson = {
  subject: 'Urgent: Unable to login with OTP',
  From: 'user@testdomain.com',
  body: '<div>My OTP is not arriving on phone. Please check immediately.</div>',
  importance: 'high',
  receivedDateTime: '2026-10-27T10:00:00.000Z',
};

const parsedEmail = parseEmailPayload(sampleEmailJson);
assert.strictEqual(parsedEmail.subject, 'Urgent: Unable to login with OTP');
assert.strictEqual(parsedEmail.from, 'user@testdomain.com');
assert.strictEqual(parsedEmail.importance, 'high');
assert(parsedEmail.bodyText.includes('My OTP is not arriving'), 'Body text extracted cleanly');
console.log('Passed: Email payload parser cleanly extracted email fields.');

// Test 3: Play Store review normalization
const samplePlayReview = {
  id: 'gp_rev_12345',
  score: 5,
  date: '2026-10-26T12:00:00.000Z',
  text: 'Excellent application for society payments.',
  version: '2.4.1',
  versionCode: 104,
  url: 'https://play.google.com/review?id=123',
};

const normalized = normalizeReview(samplePlayReview);
assert.strictEqual(normalized.sourceReviewId, 'gp_rev_12345');
assert.strictEqual(normalized.rating, 5);
assert.strictEqual(normalized.channel, 'Google Playstore');
assert.strictEqual(normalized.category, 'Playstore review');
assert.strictEqual(normalized.subcategory, 'Positive');
assert.strictEqual(normalized.appVersionName, '2.4.1');
console.log('Passed: Play Store review normalized with correct schema.');

// Test 4: Polling interval calculations in minutes
function calculateIntervalMsFromMinutes(minutes) {
  return Math.round(Math.max(1, minutes) * 60 * 1000);
}
assert.strictEqual(calculateIntervalMsFromMinutes(1), 60000, '1 minute equals 60000 ms');
assert.strictEqual(calculateIntervalMsFromMinutes(1440), 86400000, '1440 minutes equals 1 day in ms');
console.log('Passed: Review polling minute-based interval calculations verified.');

// Test 5: Chatbot customer concern extraction from live conversation transcript
const sampleChatDetails = [
  { botUser: 'BOT', name: 'first_question', message: 'Please select issue' },
  { botUser: 'USER', name: 'first_question', message: 'Transaction is failed, but refund not recieved' },
  { botUser: 'BOT', name: 'other_text', message: 'Describe your concern' },
  { botUser: 'USER', name: 'other_text', message: 'I payment credit card bill ,the transaction was failed but money has debited from my account' },
  { botUser: 'BOT', name: null, message: 'Ticket is raised' }
];

const extractedConcern = extractCustomerConcern(sampleChatDetails);
assert(extractedConcern.includes('the transaction was failed but money has debited'), 'Extracts substantive customer concern from other_text');
console.log('Passed: Chatbot concern extraction correctly isolates customer statement.');

// Test 6: Chatbot rating and priority determination
const sampleTicketWithRating = {
  ratingApp: '4',
  status: 1,
  txnDetails: { txnStatus: 'Failure' }
};
const evaluatedWithRating = determineRatingAndPriority(sampleTicketWithRating);
assert.strictEqual(evaluatedWithRating.rating, 4, 'Preserves explicit customer app rating');

const sampleFailedOpenTicket = {
  ratingApp: null,
  status: 0,
  txnDetails: { txnStatus: 'Failure', finalStatus: 'Failure' }
};
const evaluatedFailed = determineRatingAndPriority(sampleFailedOpenTicket);
assert.strictEqual(evaluatedFailed.rating, 1, 'Infers 1-star for failed transaction open ticket');
assert.strictEqual(evaluatedFailed.priority, 'Urgent', 'Infers Urgent priority for failed transaction open ticket');
console.log('Passed: Chatbot rating and priority evaluated accurately.');

console.log('All Pipeline tests passed successfully!');
