'use strict';

const { getPool } = require('./connection');
const logger = require('../core/logger');
const env = require('../config/env');
const { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES } = require('../config/constants');

function settingValue(all, key, defaultValue = undefined) {
  if (!all || !Object.prototype.hasOwnProperty.call(all, key)) {
    return defaultValue;
  }
  const entry = all[key];
  if (entry !== null && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
    return entry.value;
  }
  return entry;
}

class SettingsRepository {
  constructor() {
    this.cache = new Map();
    this.lastFetched = 0;
    this.ttlMs = 15000; // 15-second cache for high-throughput reads
  }

  _wrapCachedSettings() {
    const result = {};
    for (const [key, value] of this.cache.entries()) {
      result[key] = {
        value,
        rawValue: typeof value === 'object' ? JSON.stringify(value) : String(value),
        category: null,
        description: null,
        updatedAt: null,
      };
    }
    return result;
  }

  async getAllSettings(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache.size > 0 && (now - this.lastFetched < this.ttlMs)) {
      return this._wrapCachedSettings();
    }

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value, category, description, updated_at FROM system_settings'
    );

    this.cache.clear();
    const result = {};
    for (const row of rows) {
      let parsedValue = row.setting_value;
      if (parsedValue === 'true') parsedValue = true;
      else if (parsedValue === 'false') parsedValue = false;
      else if (/^\d+$/.test(parsedValue)) parsedValue = parseInt(parsedValue, 10);
      else {
        try {
          if (parsedValue.startsWith('{') || parsedValue.startsWith('[')) {
            parsedValue = JSON.parse(parsedValue);
          }
        } catch (e) {
          // Keep string as-is
        }
      }
      this.cache.set(row.setting_key, parsedValue);
      result[row.setting_key] = {
        value: parsedValue,
        rawValue: row.setting_value,
        category: row.category,
        description: row.description,
        updatedAt: row.updated_at,
      };
    }

    this.lastFetched = now;
    return result;
  }

  async get(key, defaultValue = null) {
    if (this.cache.has(key) && (Date.now() - this.lastFetched < this.ttlMs)) {
      return this.cache.get(key);
    }
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      [key]
    );
    if (rows.length === 0) return defaultValue;

    let parsed = rows[0].setting_value;
    if (parsed === 'true') parsed = true;
    else if (parsed === 'false') parsed = false;
    else if (/^\d+$/.test(parsed)) parsed = parseInt(parsed, 10);
    else {
      try {
        if (parsed.startsWith('{') || parsed.startsWith('[')) {
          parsed = JSON.parse(parsed);
        }
      } catch (e) {
        // Keep string as-is
      }
    }
    this.cache.set(key, parsed);
    return parsed;
  }

  async set(key, value, category = 'general', description = '') {
    const pool = getPool();
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, category, description, updated_at)
       VALUES (?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         category = VALUES(category),
         description = CASE WHEN VALUES(description) != '' THEN VALUES(description) ELSE description END,
         updated_at = NOW(3)`,
      [key, stringValue, category, description]
    );

    this.cache.clear();
    this.lastFetched = 0;
    logger.info({ key, category }, 'System setting updated');
  }

  async getAiConfig() {
    const all = await this.getAllSettings();
    const categories = settingValue(all, 'ai_categories', DEFAULT_CATEGORIES);
    const subcategories = settingValue(all, 'ai_subcategories', DEFAULT_SUBCATEGORIES);

    const provider = settingValue(all, 'ai_provider', 'openrouter');
    const isAiOpenAi = provider === 'openai';

    return {
      enabled: settingValue(all, 'ai_enabled', true),
      provider,
      model: settingValue(all, 'ai_model', '') || (isAiOpenAi ? (env.OPENAI_MODEL || 'gpt-4o') : (env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct')),
      apiKey: settingValue(all, 'ai_api_key', '') || (isAiOpenAi ? (env.OPENAI_API_KEY || '') : (env.OPENROUTER_API_KEY || '')),
      baseUrl: settingValue(all, 'ai_base_url', '') || (isAiOpenAi ? (env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1')),
      timeoutMs: settingValue(all, 'ai_timeout_ms', null) || env.OPENROUTER_TIMEOUT_MS || 30000,
      categories: Array.isArray(categories) ? categories : DEFAULT_CATEGORIES,
      subcategories: typeof subcategories === 'object' ? subcategories : DEFAULT_SUBCATEGORIES,

      // Source-specific AI flags (if false, map normally)
      sourceEmailEnabled: settingValue(all, 'ai_source_email_enabled', true),
      sourcePlaystoreEnabled: settingValue(all, 'ai_source_playstore_enabled', false),
      sourceChatbotEnabled: settingValue(all, 'ai_source_chatbot_enabled', false),
    };
  }

  async getPollingConfig() {
    const all = await this.getAllSettings();

    const emailIntervalMinutes = resolvePollingMinutes(
      settingValue(all, 'polling_email_interval_minutes'),
      settingValue(all, 'polling_email_interval_seconds'),
      (legacy) => Math.max(1, Math.round(Number(legacy) / 60)),
      1,
    );
    const playstoreIntervalMinutes = resolvePollingMinutes(
      settingValue(all, 'polling_playstore_interval_minutes'),
      settingValue(all, 'polling_playstore_interval_days'),
      (legacy) => Math.max(1, Math.round(Number(legacy) * 1440)),
      1440,
    );
    const chatbotIntervalMinutes = resolvePollingMinutes(
      settingValue(all, 'polling_chatbot_interval_minutes'),
      settingValue(all, 'polling_chatbot_interval_hours'),
      (legacy) => Math.max(1, Math.round(Number(legacy) * 60)),
      60,
    );

    return {
      // Email
      emailEnabled: settingValue(all, 'polling_email_enabled', true),
      emailIntervalMinutes,

      // Play Store
      playstoreEnabled: settingValue(all, 'polling_playstore_enabled', true),
      playstoreIntervalMinutes,
      playstoreScrapeOnStart: settingValue(all, 'polling_playstore_scrape_on_start', true),
      playstorePackage: settingValue(all, 'playstore_app_package', 'com.npst.timepay.society'),
      playstoreCountry: settingValue(all, 'playstore_country', 'in'),
      playstoreLanguages: settingValue(all, 'playstore_languages', ['en', 'hi']),
      playstoreInitialImportDays: settingValue(all, 'playstore_initial_import_days', 30),
      playstoreOverlapDays: settingValue(all, 'playstore_overlap_days', 7),
      playstoreMaxItems: settingValue(all, 'playstore_max_items_per_lang', 5000),

      // Chatbot Polling
      chatbotEnabled: settingValue(all, 'polling_chatbot_enabled', true),
      chatbotIntervalMinutes,
      chatbotApiUrl: settingValue(all, 'polling_chatbot_api_url', 'https://notification.timepayonline.com:8443/webListChatBot'),
      chatbotCategoriesUrl: settingValue(all, 'polling_chatbot_categories_url', 'https://notification.timepayonline.com:8443/api/categories'),
      chatbotApiKey: settingValue(all, 'polling_chatbot_api_key', ''),
      chatbotPollOnStart: settingValue(all, 'polling_chatbot_poll_on_start', true),
      chatbotTxnTypes: settingValue(all, 'polling_chatbot_txn_types', ['BBPS', 'P2M', 'P2P']),
      chatbotInsecureTls: settingValue(all, 'polling_chatbot_insecure_tls', true),
    };
  }
}

const settingsRepository = new SettingsRepository();

function resolvePollingMinutes(primaryValue, legacyValue, convertLegacy, fallback) {
  if (primaryValue !== undefined && primaryValue !== null && primaryValue !== '') {
    const parsed = Number(primaryValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (legacyValue !== undefined && legacyValue !== null && legacyValue !== '') {
    const legacy = Number(legacyValue);
    if (Number.isFinite(legacy) && legacy > 0) {
      return convertLegacy(legacy);
    }
  }
  return fallback;
}

module.exports = {
  SettingsRepository,
  settingsRepository,
};
