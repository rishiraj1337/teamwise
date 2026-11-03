'use strict';

const logger = require('../../core/logger');
const { getPool } = require('../../database/connection');
const { reviewRepository } = require('../../database/reviewRepository');
const { chatbotRepository } = require('../../database/chatbotRepository');
const { settingsRepository } = require('../../database/settingsRepository');
const { TimepayChatbotClient } = require('./timepayChatbotClient');
const { maskPII } = require('../../core/security');
const { auditRepository } = require('../../database/auditRepository');

function extractCustomerConcern(chatDetails) {
  if (!Array.isArray(chatDetails) || chatDetails.length === 0) {
    return 'Customer reported transaction or service issue';
  }

  // Priority 1: User's other_text (explicit free-form detailed concern)
  const otherText = chatDetails.find(c => c.botUser === 'USER' && c.name === 'other_text');
  if (otherText && otherText.message && otherText.message.trim()) {
    return otherText.message.trim();
  }

  // Priority 2: Any substantive User message that is not just "Yes" / "No"
  const substantive = chatDetails.find(c => c.botUser === 'USER' && !['yes', 'no', 'others'].includes(c.message.trim().toLowerCase()));
  if (substantive && substantive.message) {
    return substantive.message.trim();
  }

  // Priority 3: All user messages joined
  const userMessages = chatDetails.filter(c => c.botUser === 'USER').map(c => c.message.trim());
  if (userMessages.length > 0) {
    return userMessages.join(' | ');
  }

  return 'Customer initiated chatbot support session';
}

function determineRatingAndPriority(item) {
  // Check explicit app rating
  if (item.ratingApp !== null && item.ratingApp !== undefined && item.ratingApp !== '') {
    const parsed = Number(item.ratingApp);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 5) {
      return {
        rating: parsed,
        priority: parsed <= 2 ? 'High' : 'Medium',
      };
    }
  }

  const txn = item.txnDetails || {};
  const isFailedTxn = txn.txnStatus === 'Failure' || txn.finalStatus === 'Failure';
  const isOpen = item.status === 0;

  if (isFailedTxn && isOpen) {
    return { rating: 1, priority: 'Urgent' };
  }
  if (isFailedTxn) {
    return { rating: 2, priority: 'High' };
  }
  if (isOpen) {
    return { rating: 2, priority: 'High' };
  }

  return { rating: 3, priority: 'Medium' };
}

class ChatbotPollingService {
  constructor() {
    this.isPolling = false;
    this.stats = {
      lastPollAt: null,
      lastNewCount: 0,
      totalPolled: 0,
      lastError: null,
    };
    this.notificationDispatcher = null;
  }

  setNotificationDispatcher(dispatcher) {
    this.notificationDispatcher = dispatcher;
  }

  async pollCategories() {
    try {
      const pollConfig = await settingsRepository.getPollingConfig();
      const client = new TimepayChatbotClient({
        baseUrl: pollConfig.chatbotApiUrl ? new URL(pollConfig.chatbotApiUrl).origin : 'https://notification.timepayonline.com:8443',
        insecureTls: pollConfig.chatbotInsecureTls,
      });

      const categories = await client.fetchCategories(pollConfig.chatbotCategoriesUrl || '/api/categories');
      if (categories && categories.length > 0) {
        await chatbotRepository.saveCategories(categories);
        logger.debug({ count: categories.length }, 'Updated review_category from chatbot API');
      }
      return categories;
    } catch (err) {
      logger.debug(`Chatbot category sync skipped: ${err.message}`);
      return [];
    }
  }

  async pollFeedback(options = {}) {
    if (this.isPolling) {
      logger.debug('Chatbot polling already in progress, skipping cycle');
      return { newCount: 0, inProgress: true };
    }

    this.isPolling = true;
    this.stats.lastPollAt = new Date().toISOString();
    let newItemsCount = 0;

    try {
      const pollConfig = await settingsRepository.getPollingConfig();
      if (!pollConfig.chatbotEnabled) {
        logger.debug('Chatbot polling is disabled in configuration');
        return { newCount: 0, inProgress: false };
      }

      // Step 1: Sync active categories
      await this.pollCategories();

      // Step 2: Fetch Chatbot Tickets from TimePay API
      const client = new TimepayChatbotClient({
        baseUrl: pollConfig.chatbotApiUrl ? new URL(pollConfig.chatbotApiUrl).origin : 'https://notification.timepayonline.com:8443',
        insecureTls: pollConfig.chatbotInsecureTls,
      });

      const listEndpoint = pollConfig.chatbotApiUrl
        ? new URL(pollConfig.chatbotApiUrl).pathname
        : '/webListChatBot';

      const txnTypes = options.txnType || pollConfig.chatbotTxnTypes || ['BBPS', 'P2M', 'P2P'];
      const piiMasking = await settingsRepository.get('compliance_pii_masking', true);

      // Support polling multiple txnType subsets if configured (e.g., ["BBPS"], ["P2M", "P2P"])
      const queryBatches = [
        ['BBPS'],
        ['P2M', 'P2P'],
      ];

      const allFetchedItems = [];
      const seenIds = new Set();

      for (const batch of queryBatches) {
        try {
          const result = await client.fetchChatbotList({
            listPath: listEndpoint,
            page: options.page !== undefined ? options.page : 0,
            size: options.size || 20,
            txnType: batch,
            complainId: options.complainId || '',
            fromDate: options.fromDate || '',
            toDate: options.toDate || '',
            status: options.status !== undefined ? options.status : '',
            ticketCategory: options.ticketCategory || [],
            apiKey: pollConfig.chatbotApiKey,
          });

          for (const item of result.items) {
            if (!seenIds.has(item._id)) {
              seenIds.add(item._id);
              allFetchedItems.push(item);
            }
          }
        } catch (batchErr) {
          logger.debug({ error: batchErr.message, batch }, 'Batch poll failed for txnType');
        }
      }

      logger.debug({ totalFetched: allFetchedItems.length }, 'Received chatbot tickets from TimePay API');

      // Step 3: Process, persist to chatbot_sessions, and ingest into unified review table
      const pool = getPool();
      const aiConfig = await settingsRepository.getAiConfig();
      const useAi = Boolean(aiConfig.sourceChatbotEnabled && aiConfig.enabled);

      // Pre-fetch all mapped source IDs in a single bulk query to eliminate repetitive queries in loop
      const mappedIdMap = new Map();
      if (allFetchedItems.length > 0) {
        const sourceIds = allFetchedItems.map(item => `chatbot:${item.complaintId || item._id}`);
        const placeholders = sourceIds.map(() => '?').join(', ');
        const [mappedRows] = await pool.query(
          `SELECT source_review_id, review_unique_id FROM review_source_id_map WHERE source_review_id IN (${placeholders})`,
          sourceIds
        );
        for (const row of mappedRows) {
          mappedIdMap.set(row.source_review_id, row.review_unique_id);
        }
      }

      for (const item of allFetchedItems) {
        const complaintId = item.complaintId || item._id;
        const sourceReviewId = `chatbot:${complaintId}`;

        let reviewUniqueId = mappedIdMap.get(sourceReviewId) || null;

        // Save into chatbot_sessions repository
        await chatbotRepository.saveSession(item, reviewUniqueId);

        if (!reviewUniqueId) {
          // Check per-source AI configuration: if AI enabled for Chatbot, run AI classification, else map normally
          const { rating: normalRating, priority: normalPriority } = determineRatingAndPriority(item);
          let customerConcern = extractCustomerConcern(item.chatDetails);
          if (piiMasking) {
            customerConcern = maskPII(customerConcern);
          }

          let finalRating = normalRating;
          let finalCategory = item.categoryName || 'Chatbot Complaint';
          let finalSubcategory = item.ticketCategory || (item.txnDetails && item.txnDetails.txnType) || 'General';
          let finalPriority = normalPriority;
          let finalDepartment = normalRating <= 2 ? 'Operations & Disputes' : 'Customer Support';
          let finalResolution = item.status === 1 ? 'Closed by user or team' : 'Open Ticket';

          if (useAi) {
            try {
              const aiExtracted = await aiService.extractReview({
                subject: `Chatbot Complaint (${complaintId}): ${item.categoryName || ''}`,
                bodyText: customerConcern,
                importance: normalPriority === 'Urgent' ? 'high' : 'normal',
              }, aiConfig);

              finalRating = aiExtracted.star_ratings || finalRating;
              finalCategory = aiExtracted.category || finalCategory;
              finalSubcategory = aiExtracted.subcategory || finalSubcategory;
              finalPriority = aiExtracted.priority || finalPriority;
              finalDepartment = aiExtracted.department || finalDepartment;
              if (aiExtracted.resolution && aiExtracted.resolution !== 'N/A') {
                finalResolution = aiExtracted.resolution;
              }
            } catch (aiErr) {
              logger.debug({ error: aiErr.message, complaintId }, 'AI enrichment for chatbot ticket failed, mapped normally');
            }
          }

          const txn = item.txnDetails || {};
          const statusText = item.status === 1 ? 'Closed' : item.status === 2 ? 'In Progress' : 'New';

          const reviewRecord = {
            channel: 'Chatbot',
            unique_id: '', // Will be assigned next TPR sequence
            app_version_code: txn.osversionno ? String(txn.osversionno) : 'N/A',
            app_version_name: txn.appversionno ? String(txn.appversionno) : 'N/A',
            review_timestamp: item.createdAt ? new Date(item.createdAt) : new Date(),
            star_ratings: finalRating,
            review_text: customerConcern.slice(0, 1000),
            category: finalCategory.slice(0, 100),
            subcategory: finalSubcategory.slice(0, 100),
            priority: finalPriority,
            status: statusText,
            resolution: finalResolution.slice(0, 1000),
            department: finalDepartment,
            response_timestamp: null,
            resolution_date: item.status === 1 ? new Date(item.createdAt) : null,
            developer_reply_time: null,
            developer_reply_text: 'N/A',
            review_link: `https://notification.timepayonline.com:8443/ticket/${complaintId}`,
          };

          const savedReview = await reviewRepository.upsertReview(reviewRecord);
          reviewUniqueId = savedReview.unique_id;
          mappedIdMap.set(sourceReviewId, reviewUniqueId);

          // Map source ID to prevent duplicates
          await pool.query(
            'INSERT INTO review_source_id_map (source_review_id, review_unique_id) VALUES (?, ?)',
            [sourceReviewId, reviewUniqueId]
          );

          // Update session with mapped review ID
          await pool.query(
            'UPDATE chatbot_sessions SET review_unique_id = ? WHERE id = ?',
            [reviewUniqueId, item._id]
          );

          newItemsCount++;

          if (this.notificationDispatcher && (finalRating <= 2 || finalPriority === 'Urgent')) {
            this.notificationDispatcher.broadcastAlert({
              title: `Chatbot Alert [${complaintId}]`,
              body: `${finalRating} Stars: ${item.categoryName} - ${customerConcern.slice(0, 100)}`,
              url: `/chatbot#${complaintId}`,
              priority: finalPriority,
            });
          }
        }
      }

      this.stats.lastNewCount = newItemsCount;
      this.stats.totalPolled += newItemsCount;

      await auditRepository.log({
        userEmail: 'system:chatbot-poller',
        action: 'CHATBOT_POLL_EXECUTED',
        resource: 'chatbot_sessions',
        details: {
          itemsFetched: allFetchedItems.length,
          newReviewsCreated: newItemsCount,
          status: 'success',
        },
      });

      return { fetchedCount: allFetchedItems.length, newCount: newItemsCount, inProgress: false };
    } catch (err) {
      logger.warn(`Chatbot feedback polling failed: ${err.message}`);
      this.stats.lastError = err.message;

      await auditRepository.log({
        userEmail: 'system:chatbot-poller',
        action: 'CHATBOT_POLL_FAILED',
        resource: 'chatbot_sessions',
        details: { error: err.message },
      }).catch(() => {});

      return { newCount: 0, inProgress: false, error: err.message };
    } finally {
      this.isPolling = false;
    }
  }

  getStats() {
    return {
      ...this.stats,
      isPolling: this.isPolling,
    };
  }
}

const chatbotPollingService = new ChatbotPollingService();

module.exports = {
  ChatbotPollingService,
  chatbotPollingService,
  extractCustomerConcern,
  determineRatingAndPriority,
};
