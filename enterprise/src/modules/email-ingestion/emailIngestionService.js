'use strict';

const logger = require('../../core/logger');
const { fileWatcher } = require('./fileWatcher');
const { parseEmailPayload } = require('./emailParser');
const { aiService } = require('../../ai/aiService');
const { reviewRepository } = require('../../database/reviewRepository');
const { settingsRepository } = require('../../database/settingsRepository');
const { maskPII } = require('../../core/security');
const { auditRepository } = require('../../database/auditRepository');

const { heuristicClassify } = require('../../ai/heuristicClassifier');

class EmailIngestionService {
  constructor() {
    this.isProcessing = false;
    this.stats = {
      processedCount: 0,
      supportCount: 0,
      nonSupportCount: 0,
      failedCount: 0,
      lastRunAt: null,
      lastError: null,
      lastBatchNewReviews: 0,
    };
    this.notificationDispatcher = null;
  }

  setNotificationDispatcher(dispatcher) {
    this.notificationDispatcher = dispatcher;
  }

  async processAllPending() {
    if (this.isProcessing) {
      logger.debug('Email ingestion already in progress, skipping cycle');
      return { processed: 0, failed: 0, newReviews: 0, inProgress: true };
    }

    this.isProcessing = true;
    this.stats.lastRunAt = new Date().toISOString();
    let processedThisBatch = 0;
    let failedThisBatch = 0;
    let newReviewsThisBatch = 0;

    try {
      const files = fileWatcher.listPendingFiles();
      if (files.length === 0) {
        this.stats.lastBatchNewReviews = 0;
        return { processed: 0, failed: 0, newReviews: 0, inProgress: false };
      }

      logger.debug({ fileCount: files.length }, 'Discovered pending email files for ingestion');

      const aiConfig = await settingsRepository.getAiConfig();
      const piiMasking = await settingsRepository.get('compliance_pii_masking', true);

      for (const file of files) {
        const outcome = await this.processFile(file.name, aiConfig, piiMasking);
        if (outcome.success) {
          processedThisBatch++;
          this.stats.processedCount++;
          if (outcome.savedToReviewTable) {
            newReviewsThisBatch++;
          }
        } else {
          failedThisBatch++;
          this.stats.failedCount++;
        }
      }
    } catch (err) {
      logger.warn(`Email batch processing error: ${err.message}`);
      this.stats.lastError = err.message;
    } finally {
      this.isProcessing = false;
    }

    this.stats.lastBatchNewReviews = newReviewsThisBatch;

    return {
      processed: processedThisBatch,
      failed: failedThisBatch,
      newReviews: newReviewsThisBatch,
      inProgress: false,
    };
  }

  async processFile(filename, aiConfig, piiMasking = true) {
    logger.debug({ file: filename }, 'Ingesting email file');
    let rawContent;
    try {
      rawContent = fileWatcher.readFileContent(filename);
    } catch (err) {
      logger.warn(`Unable to read email file ${filename}: ${err.message}`);
      this.stats.lastError = `Read error: ${err.message}`;
      return { success: false, savedToReviewTable: false };
    }

    let rawJson;
    try {
      rawJson = JSON.parse(rawContent);
    } catch (err) {
      logger.warn(`Invalid JSON in email file ${filename}: ${err.message}`);
      fileWatcher.moveToFailed(filename, `Invalid JSON syntax: ${err.message}`);
      this.stats.lastError = `JSON error: ${err.message}`;
      return { success: false, savedToReviewTable: false };
    }

    try {
      const emailData = parseEmailPayload(rawJson);

      // Check per-source AI configuration: if AI not used, map normally via local heuristics
      const useAi = Boolean(aiConfig.sourceEmailEnabled !== false && aiConfig.enabled !== false);
      const extracted = useAi
        ? await aiService.extractReview(emailData, aiConfig)
        : heuristicClassify(emailData, aiConfig.categories, aiConfig.subcategories);

      // Support Mail Filter: Only allow legitimate customer support / reviews into main DB
      const isSupport = Boolean(extracted.is_support ?? (extracted.support_flag === 'support'));

      if (!isSupport) {
        const rejectionReason = extracted.rejection_reason || 'Flagged as non-support email';
        const supportFlag = extracted.support_flag || 'not_support';

        logger.debug(
          { file: filename, reason: rejectionReason, supportFlag, from: emailData.from },
          'Email filtered as non-support; quarantined to separate bucket',
        );

        // 1. Move to filesystem non-support bucket directory
        fileWatcher.moveToNonSupport(filename, rejectionReason, {
          from: emailData.from,
          subject: emailData.subject,
          supportFlag,
          rejectionReason,
        });

        // 2. Persist in separate filtered_emails database bucket (main review table stays pure)
        await reviewRepository.saveFilteredEmail({
          messageId: emailData.messageId,
          fromAddress: emailData.from,
          subject: emailData.subject,
          receivedDateTime: emailData.receivedDateTime,
          supportFlag,
          rejectionReason,
          fileName: filename,
          bodySnippet: emailData.bodyText ? emailData.bodyText.slice(0, 950) : '',
          rawMetadata: emailData.rawMetadata,
        });

        // 3. Audit trail
        await auditRepository.log({
          userEmail: 'system:email-ingestion',
          action: 'EMAIL_FILTERED_NON_SUPPORT',
          resource: emailData.messageId || filename,
          details: {
            file: filename,
            from: emailData.from,
            subject: emailData.subject,
            supportFlag,
            rejectionReason,
          },
        });

        this.stats.nonSupportCount++;
        return { success: true, savedToReviewTable: false };
      }

      let finalReviewText = extracted.review_text;
      if (piiMasking) {
        finalReviewText = maskPII(finalReviewText);
      }

      // Prepare database record for support email
      const reviewRecord = {
        channel: 'Email-SFTP',
        unique_id: '', // Will be assigned TPR sequence in reviewRepository
        app_version_code: rawJson.app_version_code || 'N/A',
        app_version_name: rawJson.app_version_name || 'N/A',
        review_timestamp: emailData.receivedDateTime ? new Date(emailData.receivedDateTime) : new Date(),
        star_ratings: extracted.star_ratings,
        review_text: finalReviewText,
        category: extracted.category,
        subcategory: extracted.subcategory,
        priority: extracted.priority,
        status: extracted.status || 'New',
        resolution: extracted.resolution || 'N/A',
        department: extracted.department || 'Customer Support',
        response_timestamp: null,
        resolution_date: null,
        developer_reply_time: null,
        developer_reply_text: 'N/A',
        review_link: extracted.review_link || 'N/A',
      };

      const saved = await reviewRepository.upsertReview(reviewRecord);
      fileWatcher.moveToProcessed(filename);
      this.stats.supportCount++;

      await auditRepository.log({
        userEmail: 'system:email-ingestion',
        action: 'EMAIL_INGESTED',
        resource: saved.unique_id,
        details: {
          file: filename,
          rating: saved.star_ratings,
          category: saved.category,
          source: extracted.classificationSource,
        },
      });

      // Notify if high priority or negative review
      if (this.notificationDispatcher && (saved.star_ratings <= 2 || saved.priority === 'Urgent')) {
        this.notificationDispatcher.broadcastAlert({
          title: `Critical Feedback [${saved.unique_id}]`,
          body: `${saved.star_ratings} Stars: ${saved.category} - ${saved.review_text.slice(0, 100)}`,
          url: `/dashboard#${saved.unique_id}`,
          priority: saved.priority,
        });
      }

      logger.debug({ uniqueId: saved.unique_id, file: filename, category: saved.category }, 'Email review processed and saved');
      return { success: true, savedToReviewTable: true };
    } catch (err) {
      logger.warn(`Email processing failed for ${filename}: ${err.message}`);
      fileWatcher.moveToFailed(filename, err.message);
      this.stats.lastError = err.message;
      return { success: false, savedToReviewTable: false };
    }
  }

  getStats() {
    return {
      ...this.stats,
      isProcessing: this.isProcessing,
      pendingCount: fileWatcher.listPendingFiles().length,
    };
  }
}

const emailIngestionService = new EmailIngestionService();

module.exports = {
  EmailIngestionService,
  emailIngestionService,
};
