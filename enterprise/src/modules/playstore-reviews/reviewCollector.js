'use strict';

const logger = require('../../core/logger');
const { getPool, withTransaction } = require('../../database/connection');
const { settingsRepository } = require('../../database/settingsRepository');
const { GooglePlayClient } = require('./googlePlayClient');
const { normalizeReviews } = require('./normalizeReview');
const { applyPlaystoreClassificationFields, resolvePlaystoreTaxonomyIds } = require('./playstoreClassification');
const { aiService } = require('../../ai/aiService');
const { auditRepository } = require('../../database/auditRepository');
const { truncateUtf8 } = require('../../core/stringUtil');

const REVIEW_LINK_MAX_BYTES = 512;

const REVIEW_COLUMNS = [
  'channel',
  'unique_id',
  'app_version_code',
  'app_version_name',
  'review_timestamp',
  'star_ratings',
  'review_text',
  'category',
  'subcategory',
  'category_id',
  'subcategory_id',
  'priority_id',
  'priority',
  'status',
  'resolution',
  'department',
  'response_timestamp',
  'resolution_date',
  'developer_reply_time',
  'developer_reply_text',
  'review_link',
  'created_at',
  'updated_at',
];

class ReviewCollector {
  constructor(client = null) {
    this._clientOverride = client;
    this.isCollecting = false;
    this.stats = {
      lastSyncAt: null,
      lastNewReviewsCount: 0,
      totalSynced: 0,
      lastError: null,
    };
    this.notificationDispatcher = null;
  }

  setNotificationDispatcher(dispatcher) {
    this.notificationDispatcher = dispatcher;
  }

  getClient() {
    if (!this._clientOverride) {
      this._clientOverride = new GooglePlayClient();
    }
    return this._clientOverride;
  }

  async getCollectionState(languages) {
    if (!languages || languages.length === 0) return {};
    const pool = getPool();
    const placeholders = languages.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT language, last_successful_collection_at
       FROM review_collection_checkpoint
       WHERE language IN (${placeholders})`,
      languages
    );

    const map = {};
    for (const r of rows) {
      map[r.language] = r.last_successful_collection_at;
    }
    return map;
  }

  async collect(options = {}) {
    if (this.isCollecting) {
      logger.debug('Play Store review collection already in progress');
      return { newReviewCount: 0, inProgress: true };
    }

    this.isCollecting = true;
    this.stats.lastSyncAt = new Date().toISOString();

    try {
      const dbConfig = await settingsRepository.getPollingConfig();
      const appPackageName = options.appPackageName || dbConfig.playstorePackage;
      const country = options.country || dbConfig.playstoreCountry;
      const languages = options.languages || dbConfig.playstoreLanguages;
      const initialImportDays = options.initialImportDays || dbConfig.playstoreInitialImportDays;
      const overlapDays = options.overlapDays || dbConfig.playstoreOverlapDays;
      const maxItems = options.maxItems || dbConfig.playstoreMaxItems;

      logger.debug({ appPackageName, country, languages }, 'Starting Google Play Store review collection');

      const checkpoints = await this.getCollectionState(languages);
      const allFetchedReviews = [];
      const now = new Date();

      for (const lang of languages) {
        const lastCheckpoint = checkpoints[lang];
        let dateFrom;
        if (lastCheckpoint) {
          dateFrom = new Date(new Date(lastCheckpoint).getTime() - overlapDays * 24 * 60 * 60 * 1000);
        } else {
          dateFrom = new Date(now.getTime() - initialImportDays * 24 * 60 * 60 * 1000);
        }

        try {
          const rawReviews = await this.getClient().fetchReviews({
            appPackageName,
            country,
            language: lang,
            dateFrom: dateFrom.toISOString(),
            maxItems,
          });

          const normalized = normalizeReviews(rawReviews);
          allFetchedReviews.push(...normalized);
          logger.debug({ language: lang, count: normalized.length }, 'Fetched reviews from Google Play');
        } catch (fetchErr) {
          logger.warn(`Play Store fetch failed for language "${lang}": ${fetchErr.message}`);
        }
      }

      // Deduplicate by sourceReviewId
      const uniqueSourceMap = new Map();
      for (const rev of allFetchedReviews) {
        if (!uniqueSourceMap.has(rev.sourceReviewId)) {
          uniqueSourceMap.set(rev.sourceReviewId, rev);
        }
      }

      const deduplicatedReviews = Array.from(uniqueSourceMap.values());

      // Check per-source AI configuration: if AI enabled for Play Store, enrich review classification, else map normally
      const aiConfig = await settingsRepository.getAiConfig();
      if (aiConfig.sourcePlaystoreEnabled && aiConfig.enabled) {
        for (const rev of deduplicatedReviews) {
          if (rev.reviewText && rev.reviewText !== 'N/A' && rev.reviewText.trim().length > 10) {
            try {
              const aiExtracted = await aiService.extractReview({
                subject: `Google Play Review (${rev.rating} Stars)`,
                bodyText: rev.reviewText,
                importance: rev.rating <= 2 ? 'high' : 'normal',
              }, aiConfig);

              rev.category = aiExtracted.category || rev.category;
              rev.subcategory = aiExtracted.subcategory || rev.subcategory;
              rev.priority = aiExtracted.priority || rev.priority;
              rev.department = aiExtracted.department || rev.department;
            } catch (aiErr) {
              applyPlaystoreClassificationFields(rev);
            }
          }
        }
      } else {
        for (const rev of deduplicatedReviews) {
          applyPlaystoreClassificationFields(rev);
        }
      }

      const result = await this.saveReviewsAndCheckpoints(deduplicatedReviews, languages, now);

      this.stats.lastNewReviewsCount = result.newReviewCount;
      this.stats.totalSynced += result.newReviewCount;

      await auditRepository.log({
        userEmail: 'system:playstore-collector',
        action: 'PLAYSTORE_POLL_EXECUTED',
        resource: 'review',
        details: {
          newReviewsCount: result.newReviewCount,
          totalReviewsInDb: result.totalReviews,
          languages,
          appPackageName,
          status: 'success',
        },
      });

      if (result.newReviewCount > 0 && this.notificationDispatcher) {
        this.notificationDispatcher.broadcastAlert({
          title: 'New Google Play Reviews',
          body: `Synced ${result.newReviewCount} new reviews from Google Play.`,
          url: '/dashboard?channel=Google+Playstore',
          priority: 'Medium',
        });
      }

      return result;
    } catch (err) {
      logger.warn(`Play Store review collection failed: ${err.message}`);
      this.stats.lastError = err.message;

      await auditRepository.log({
        userEmail: 'system:playstore-collector',
        action: 'PLAYSTORE_POLL_FAILED',
        resource: 'review',
        details: { error: err.message },
      }).catch(() => {});

      throw err;
    } finally {
      this.isCollecting = false;
    }
  }

  async saveReviewsAndCheckpoints(reviews, languages, collectionStartedAt) {
    const pool = getPool();
    let newReviewCount = 0;

    if (reviews.length > 0) {
      const sourceIds = reviews.map(r => r.sourceReviewId);
      const placeholders = sourceIds.map(() => '?').join(', ');
      const [mappedRows] = await pool.query(
        `SELECT source_review_id, review_unique_id FROM review_source_id_map WHERE source_review_id IN (${placeholders})`,
        sourceIds
      );

      const mappedSet = new Set(mappedRows.map(r => r.source_review_id));
      const unmappedReviews = reviews.filter(r => !mappedSet.has(r.sourceReviewId));

      // Only enter a database transaction if there are actually new unmapped reviews to insert
      if (unmappedReviews.length > 0) {
        await withTransaction(async (conn) => {
          const [seqRows] = await conn.query('SELECT next_id FROM review_id_sequence WHERE id = 1 FOR UPDATE');
          let nextId = seqRows.length > 0 ? Number(seqRows[0].next_id) : 1;
          const createdAt = new Date();

          for (const review of unmappedReviews) {
            const uniqueId = `TPR${String(nextId).padStart(4, '0')}`;
            applyPlaystoreClassificationFields(review);
            const taxonomyIds = await resolvePlaystoreTaxonomyIds(review, conn);
            const values = [
              review.channel || 'Google Playstore',
              uniqueId,
              review.appVersionCode,
              review.appVersionName,
              review.reviewTimestamp,
              review.rating,
              (review.reviewText || 'N/A').slice(0, 1000),
              review.category,
              review.subcategory,
              taxonomyIds.categoryId,
              taxonomyIds.subcategoryId,
              taxonomyIds.priorityId,
              review.priority,
              review.status,
              review.resolution,
              review.department,
              review.responseTimestamp,
              review.resolutionDate,
              review.developerReplyTime,
              (review.developerReplyText || 'N/A').slice(0, 1000),
              truncateUtf8(review.reviewLink || 'N/A', REVIEW_LINK_MAX_BYTES) || 'N/A',
              createdAt,
              createdAt,
            ];

            await conn.query(
              `INSERT INTO \`review\` (${REVIEW_COLUMNS.map(c => `\`${c}\``).join(', ')})
               VALUES (${REVIEW_COLUMNS.map(() => '?').join(', ')})`,
              values
            );

            await conn.query(
              'INSERT INTO review_source_id_map (source_review_id, review_unique_id) VALUES (?, ?)',
              [review.sourceReviewId, uniqueId]
            );

            nextId++;
            newReviewCount++;
          }

          if (newReviewCount > 0) {
            await conn.query('UPDATE review_id_sequence SET next_id = ? WHERE id = 1', [nextId]);
          }
        });
      }
    }

    // Checkpoints update and count are executed outside transaction to prevent holding locks
    if (languages.length > 0) {
      const checkpointValues = languages.flatMap(lang => [lang, collectionStartedAt]);
      const chkPlaceholders = languages.map(() => '(?, ?)').join(', ');
      await pool.query(
        `INSERT INTO review_collection_checkpoint (language, last_successful_collection_at)
         VALUES ${chkPlaceholders}
         ON DUPLICATE KEY UPDATE last_successful_collection_at = VALUES(last_successful_collection_at)`,
        checkpointValues
      );
    }

    const [countRows] = await pool.query('SELECT COUNT(*) AS totalReviews FROM `review`');
    return {
      newReviewCount,
      totalReviews: Number(countRows[0].totalReviews),
    };
  }

  getStats() {
    return {
      ...this.stats,
      isCollecting: this.isCollecting,
      // Aliases for Teamwise UI / legacy playstore-reviews status shape
      isScraping: this.isCollecting,
      lastRunAt: this.stats.lastSyncAt,
      totalScraped: this.stats.totalSynced,
    };
  }
}

const reviewCollector = new ReviewCollector();

module.exports = {
  ReviewCollector,
  reviewCollector,
};
