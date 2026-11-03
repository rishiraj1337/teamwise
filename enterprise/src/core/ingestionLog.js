'use strict';

const logger = require('./logger');

function plural(n, word) {
  return `${n} new ${word}${n === 1 ? '' : 's'}`;
}

function logPlaystoreIngest(newCount) {
  logger.info(`Play Store: ${plural(newCount, 'review')} added to the database.`);
}

function logChatbotIngest(newCount) {
  logger.info(`Chatbot: ${plural(newCount, 'review')} added to the database.`);
}

function logEmailIngest(newCount, failedCount = 0) {
  if (failedCount > 0) {
    logger.info(
      `Email: ${plural(newCount, 'review')} added to the database (${failedCount} file(s) could not be processed).`,
    );
    return;
  }
  logger.info(`Email: ${plural(newCount, 'review')} added to the database.`);
}

function logStartupIngestionSummary({ playstore = 0, chatbot = 0, email = 0 }) {
  logPlaystoreIngest(playstore);
  logChatbotIngest(chatbot);
  logEmailIngest(email);
}

module.exports = {
  logPlaystoreIngest,
  logChatbotIngest,
  logEmailIngest,
  logStartupIngestionSummary,
};
