'use strict';

const logger = require('../core/logger');
const { settingsRepository } = require('../database/settingsRepository');
const { emailIngestionService } = require('../modules/email-ingestion/emailIngestionService');
const { reviewCollector } = require('../modules/playstore-reviews/reviewCollector');
const { chatbotPollingService } = require('../modules/chatbot-polling/chatbotPollingService');
const { notificationDispatcher } = require('./notificationDispatcher');
const { auditRepository } = require('../database/auditRepository');
const {
  logPlaystoreIngest,
  logChatbotIngest,
  logEmailIngest,
  logStartupIngestionSummary,
} = require('../core/ingestionLog');

class JobScheduler {
  constructor() {
    this.emailTimer = null;
    this.playstoreTimer = null;
    this.chatbotTimer = null;
    this.isRunning = false;

    emailIngestionService.setNotificationDispatcher(notificationDispatcher);
    reviewCollector.setNotificationDispatcher(notificationDispatcher);
    chatbotPollingService.setNotificationDispatcher(notificationDispatcher);
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.debug('Background job scheduler starting');

    await auditRepository.log({
      userEmail: 'system:scheduler',
      action: 'SCHEDULER_STARTED',
      resource: 'scheduler',
      details: { timestamp: new Date().toISOString() },
    });

    const config = await settingsRepository.getPollingConfig();
    let emailNew = 0;
    let playstoreNew = 0;
    let chatbotNew = 0;

    if (config.emailEnabled) {
      const emailResult = await emailIngestionService.processAllPending();
      emailNew = emailResult.newReviews || 0;
    }

    if (config.playstoreEnabled && config.playstoreScrapeOnStart) {
      try {
        const playResult = await reviewCollector.collect();
        playstoreNew = playResult.newReviewCount || 0;
      } catch {
        // reviewCollector.collect() already logs a warning
      }
    }

    if (config.chatbotEnabled && config.chatbotPollOnStart) {
      try {
        const chatResult = await chatbotPollingService.pollFeedback();
        chatbotNew = chatResult.newCount || 0;
      } catch (err) {
        logger.warn(`Chatbot poll on startup failed: ${err.message}`);
      }
    }

    logStartupIngestionSummary({ playstore: playstoreNew, chatbot: chatbotNew, email: emailNew });

    this.scheduleEmailPolling(true);
    this.schedulePlaystorePolling();
    this.scheduleChatbotPolling();
  }

  async schedulePlaystorePolling() {
    if (!this.isRunning) return;

    try {
      const config = await settingsRepository.getPollingConfig();
      const intervalMinutes = Math.max(1, config.playstoreIntervalMinutes || 1440);
      const intervalMs = Math.round(intervalMinutes * 60 * 1000);

      logger.debug(
        { intervalMinutes, nextRunInHours: (intervalMs / (1000 * 60 * 60)).toFixed(2) },
        'Scheduled Play Store review polling',
      );

      this.playstoreTimer = setTimeout(async () => {
        if (!this.isRunning) return;
        try {
          const freshConfig = await settingsRepository.getPollingConfig();
          if (freshConfig.playstoreEnabled) {
            const result = await reviewCollector.collect();
            if (result.newReviewCount > 0) {
              logPlaystoreIngest(result.newReviewCount);
            }
          }
        } catch (err) {
          logger.warn(`Play Store sync failed: ${err.message}`);
        }
        this.schedulePlaystorePolling();
      }, intervalMs);
    } catch (err) {
      logger.warn(`Play Store schedule error: ${err.message}`);
      this.playstoreTimer = setTimeout(() => this.schedulePlaystorePolling(), 60000);
    }
  }

  async scheduleChatbotPolling() {
    if (!this.isRunning) return;

    try {
      const config = await settingsRepository.getPollingConfig();
      const intervalMinutes = Math.max(1, config.chatbotIntervalMinutes || 60);
      const intervalMs = Math.round(intervalMinutes * 60 * 1000);

      logger.debug({ intervalMinutes }, 'Scheduled Chatbot feedback polling');

      this.chatbotTimer = setTimeout(async () => {
        if (!this.isRunning) return;
        try {
          const freshConfig = await settingsRepository.getPollingConfig();
          if (freshConfig.chatbotEnabled) {
            const result = await chatbotPollingService.pollFeedback();
            if (result.newCount > 0) {
              logChatbotIngest(result.newCount);
            }
          }
        } catch (err) {
          logger.warn(`Chatbot poll failed: ${err.message}`);
        }
        this.scheduleChatbotPolling();
      }, intervalMs);
    } catch (err) {
      logger.warn(`Chatbot schedule error: ${err.message}`);
      this.chatbotTimer = setTimeout(() => this.scheduleChatbotPolling(), 60000);
    }
  }

  async scheduleEmailPolling(skipImmediate = false) {
    if (!this.isRunning) return;

    const runCycle = async () => {
      if (!this.isRunning) return;
      try {
        const config = await settingsRepository.getPollingConfig();
        if (config.emailEnabled) {
          const result = await emailIngestionService.processAllPending();
          if (result.newReviews > 0 || result.failed > 0) {
            logEmailIngest(result.newReviews, result.failed);
          }
        }
        const intervalMs = Math.max(1, config.emailIntervalMinutes) * 60 * 1000;
        this.emailTimer = setTimeout(runCycle, intervalMs);
      } catch (err) {
        logger.warn(`Email ingestion failed: ${err.message}`);
        this.emailTimer = setTimeout(runCycle, 10000);
      }
    };

    if (skipImmediate) {
      const config = await settingsRepository.getPollingConfig();
      const intervalMs = Math.max(1, config.emailIntervalMinutes) * 60 * 1000;
      this.emailTimer = setTimeout(runCycle, intervalMs);
    } else {
      await runCycle();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.emailTimer) {
      clearTimeout(this.emailTimer);
      this.emailTimer = null;
    }
    if (this.playstoreTimer) {
      clearTimeout(this.playstoreTimer);
      this.playstoreTimer = null;
    }
    if (this.chatbotTimer) {
      clearTimeout(this.chatbotTimer);
      this.chatbotTimer = null;
    }
    logger.debug('Job scheduler stopped');
  }
}

const jobScheduler = new JobScheduler();

module.exports = {
  JobScheduler,
  jobScheduler,
};
