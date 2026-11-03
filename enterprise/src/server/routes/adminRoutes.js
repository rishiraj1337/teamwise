'use strict';

const express = require('express');
const router = express.Router();
const { settingsRepository } = require('../../database/settingsRepository');
const { auditRepository } = require('../../database/auditRepository');
const { writeAuditLog } = require('../../core/auditLog');
const { VaultClient } = require('../../core/vault');
const { authenticate } = require('../middleware/authMiddleware');
const { requireRole, requirePermission } = require('../middleware/rbacMiddleware');
const { ROLES } = require('../../config/constants');
const { ValidationError } = require('../../core/errors');

function resolveIntervalMinutesFromBody(primary, legacy, convertLegacy) {
  if (primary !== undefined && primary !== null && primary !== '') {
    const parsed = Number(primary);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
  }
  if (legacy !== undefined && legacy !== null && legacy !== '') {
    const legacyNum = Number(legacy);
    if (Number.isFinite(legacyNum) && legacyNum > 0) {
      return convertLegacy(legacyNum);
    }
  }
  return undefined;
}

router.use(authenticate);

// User accounts are managed in Teamwise (teamwisedb) only — no /admin/users or /admin/invites.

// ================= AI Configuration & Enums =================

router.get('/settings/ai', requirePermission('settings:read'), async (req, res, next) => {
  try {
    const aiConfig = await settingsRepository.getAiConfig();
    const maskedConfig = {
      ...aiConfig,
      apiKey: aiConfig.apiKey ? '***' : '',
    };
    res.json({ success: true, aiConfig: maskedConfig });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/ai', requireRole([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const {
      enabled,
      provider,
      model,
      apiKey,
      baseUrl,
      timeoutMs,
      categories,
      subcategories,
      sourceEmailEnabled,
      sourcePlaystoreEnabled,
      sourceChatbotEnabled,
    } = req.body;

    if (enabled !== undefined) {
      await settingsRepository.set('ai_enabled', Boolean(enabled), 'ai', 'Global switch to enable or disable AI processing');
    }
    if (sourceEmailEnabled !== undefined) {
      await settingsRepository.set('ai_source_email_enabled', Boolean(sourceEmailEnabled), 'ai', 'Enable AI for email ingestion');
    }
    if (sourcePlaystoreEnabled !== undefined) {
      await settingsRepository.set('ai_source_playstore_enabled', Boolean(sourcePlaystoreEnabled), 'ai', 'Enable AI for Play Store reviews');
    }
    if (sourceChatbotEnabled !== undefined) {
      await settingsRepository.set('ai_source_chatbot_enabled', Boolean(sourceChatbotEnabled), 'ai', 'Enable AI for Chatbot complaints');
    }
    if (provider !== undefined) {
      await settingsRepository.set('ai_provider', provider, 'ai', 'Active AI provider: openrouter or heuristic');
    }
    if (model !== undefined) {
      await settingsRepository.set('ai_model', model, 'ai', 'Model identifier for OpenRouter or custom LLM');
    }
    if (apiKey !== undefined && apiKey !== '***') {
      await settingsRepository.set('ai_api_key', apiKey, 'ai', 'API Key for AI provider');
    }
    if (baseUrl !== undefined) {
      await settingsRepository.set('ai_base_url', baseUrl, 'ai', 'Base URL for AI endpoint');
    }
    if (timeoutMs !== undefined) {
      await settingsRepository.set('ai_timeout_ms', parseInt(timeoutMs, 10), 'ai', 'AI API request timeout in milliseconds');
    }
    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        throw new ValidationError('Categories must be an array of category names');
      }
      await settingsRepository.set('ai_categories', categories, 'ai', 'Allowed category enums for AI extraction');
    }
    if (subcategories !== undefined) {
      if (typeof subcategories !== 'object') {
        throw new ValidationError('Subcategories must be an object mapping categories to arrays of subcategories');
      }
      await settingsRepository.set('ai_subcategories', subcategories, 'ai', 'Allowed subcategory mappings for AI extraction');
    }

    await writeAuditLog(req, {
      action: 'AI_SETTINGS_UPDATED',
      resource: 'settings:ai',
      details: {
        provider,
        model,
        categoriesCount: categories ? categories.length : undefined,
      },
    });

    await settingsRepository.getAllSettings(true);
    const updated = await settingsRepository.getAiConfig();
    res.json({ success: true, aiConfig: updated });
  } catch (err) {
    next(err);
  }
});

// ================= DB & Polling Settings =================

router.get('/settings/polling', requirePermission('settings:read'), async (req, res, next) => {
  try {
    const pollingConfig = await settingsRepository.getPollingConfig();
    const maskedConfig = {
      ...pollingConfig,
      chatbotApiKey: pollingConfig.chatbotApiKey ? '***' : '',
    };
    res.json({ success: true, pollingConfig: maskedConfig });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/polling', requirePermission('settings:write'), async (req, res, next) => {
  try {
    const {
      emailEnabled,
      emailIntervalMinutes,
      emailIntervalSeconds,
      playstoreEnabled,
      playstoreIntervalMinutes,
      playstoreIntervalDays,
      playstoreScrapeOnStart,
      playstorePackage,
      playstoreCountry,
      playstoreLanguages,
      playstoreInitialImportDays,
      playstoreOverlapDays,
      playstoreMaxItems,
      chatbotEnabled,
      chatbotIntervalMinutes,
      chatbotIntervalHours,
      chatbotApiUrl,
      chatbotApiKey,
      chatbotPollOnStart,
    } = req.body;

    if (emailEnabled !== undefined) {
      await settingsRepository.set('polling_email_enabled', Boolean(emailEnabled), 'polling', 'Enable automatic email polling');
    }
    const resolvedEmailMinutes = resolveIntervalMinutesFromBody(
      emailIntervalMinutes,
      emailIntervalSeconds,
      (legacy) => Math.max(1, Math.round(Number(legacy) / 60)),
    );
    if (resolvedEmailMinutes !== undefined) {
      await settingsRepository.set(
        'polling_email_interval_minutes',
        resolvedEmailMinutes,
        'polling',
        'Interval between email polling cycles in minutes',
      );
      await settingsRepository.set(
        'polling_email_interval_seconds',
        resolvedEmailMinutes * 60,
        'polling',
        'Legacy interval between email polling cycles in seconds (derived from minutes)',
      );
    }
    if (playstoreEnabled !== undefined) {
      await settingsRepository.set('polling_playstore_enabled', Boolean(playstoreEnabled), 'polling', 'Enable automatic Play Store reviews sync');
    }
    const resolvedPlaystoreMinutes = resolveIntervalMinutesFromBody(
      playstoreIntervalMinutes,
      playstoreIntervalDays,
      (legacy) => Math.max(1, Math.round(Number(legacy) * 1440)),
    );
    if (resolvedPlaystoreMinutes !== undefined) {
      await settingsRepository.set(
        'polling_playstore_interval_minutes',
        resolvedPlaystoreMinutes,
        'polling',
        'Interval between Play Store review sync cycles in minutes',
      );
      await settingsRepository.set(
        'polling_playstore_interval_days',
        Math.max(0.01, Math.round((resolvedPlaystoreMinutes / 1440) * 100) / 100),
        'polling',
        'Legacy Play Store sync interval in days (derived from minutes)',
      );
    }
    if (playstoreScrapeOnStart !== undefined) {
      await settingsRepository.set('polling_playstore_scrape_on_start', Boolean(playstoreScrapeOnStart), 'polling', 'Scrape Play Store reviews immediately on startup');
    }
    if (playstorePackage !== undefined) {
      await settingsRepository.set('playstore_app_package', playstorePackage, 'playstore', 'App package name for Google Play');
    }
    if (playstoreCountry !== undefined) {
      await settingsRepository.set('playstore_country', playstoreCountry, 'playstore', 'Target country code');
    }
    if (playstoreLanguages !== undefined) {
      await settingsRepository.set('playstore_languages', playstoreLanguages, 'playstore', 'Language codes to scrape');
    }
    if (playstoreInitialImportDays !== undefined) {
      await settingsRepository.set('playstore_initial_import_days', parseInt(playstoreInitialImportDays, 10), 'playstore', 'Days back for initial sync');
    }
    if (playstoreOverlapDays !== undefined) {
      await settingsRepository.set('playstore_overlap_days', parseInt(playstoreOverlapDays, 10), 'playstore', 'Days back for subsequent sync window overlap');
    }
    if (playstoreMaxItems !== undefined) {
      await settingsRepository.set('playstore_max_items_per_lang', parseInt(playstoreMaxItems, 10), 'playstore', 'Max reviews to fetch per language run');
    }

    if (chatbotEnabled !== undefined) {
      await settingsRepository.set('polling_chatbot_enabled', Boolean(chatbotEnabled), 'polling', 'Enable automatic Chatbot feedback polling');
    }
    const resolvedChatbotMinutes = resolveIntervalMinutesFromBody(
      chatbotIntervalMinutes,
      chatbotIntervalHours,
      (legacy) => Math.max(1, Math.round(Number(legacy) * 60)),
    );
    if (resolvedChatbotMinutes !== undefined) {
      await settingsRepository.set(
        'polling_chatbot_interval_minutes',
        resolvedChatbotMinutes,
        'polling',
        'Interval between Chatbot feedback poll cycles in minutes',
      );
      await settingsRepository.set(
        'polling_chatbot_interval_hours',
        Math.max(0.01, Math.round((resolvedChatbotMinutes / 60) * 100) / 100),
        'polling',
        'Legacy chatbot poll interval in hours (derived from minutes)',
      );
    }
    if (chatbotApiUrl !== undefined) {
      await settingsRepository.set('polling_chatbot_api_url', chatbotApiUrl, 'polling', 'REST API URL of the Chatbot service to poll feedback from');
    }
    if (chatbotApiKey !== undefined && chatbotApiKey !== '***') {
      await settingsRepository.set('polling_chatbot_api_key', chatbotApiKey, 'polling', 'API Key or bearer token to authenticate with the Chatbot service');
    }
    if (chatbotPollOnStart !== undefined) {
      await settingsRepository.set('polling_chatbot_poll_on_start', Boolean(chatbotPollOnStart), 'polling', 'Poll Chatbot feedback immediately on application startup');
    }

    await writeAuditLog(req, {
      action: 'POLLING_SETTINGS_UPDATED',
      resource: 'settings:polling',
      details: req.body,
    });

    await settingsRepository.getAllSettings(true);
    const updated = await settingsRepository.getPollingConfig();
    res.json({ success: true, pollingConfig: updated });
  } catch (err) {
    next(err);
  }
});

// ================= Security & Compliance Settings =================

router.get('/settings/compliance', requirePermission('settings:read'), async (req, res, next) => {
  try {
    const all = await settingsRepository.getAllSettings();
    res.json({
      success: true,
      compliance: {
        piiMasking: all['compliance_pii_masking']?.value ?? true,
        retentionDays: all['compliance_retention_days']?.value ?? 365,
        vaultEnabled: all['vault_enabled']?.value ?? false,
        vaultAddress: all['vault_address']?.value ?? 'http://127.0.0.1:8200',
        vaultPath: all['vault_path']?.value ?? 'secret/data/automation',
        keycloakEnabled: all['keycloak_enabled']?.value ?? false,
        keycloakRealmUrl: all['keycloak_realm_url']?.value ?? '',
        keycloakClientId: all['keycloak_client_id']?.value ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/compliance', requireRole([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const {
      piiMasking,
      retentionDays,
      vaultEnabled,
      vaultAddress,
      vaultToken,
      vaultPath,
      keycloakEnabled,
      keycloakRealmUrl,
      keycloakClientId,
    } = req.body;

    if (piiMasking !== undefined) {
      await settingsRepository.set('compliance_pii_masking', Boolean(piiMasking), 'compliance', 'Mask sensitive personal data in logs');
    }
    if (retentionDays !== undefined) {
      await settingsRepository.set('compliance_retention_days', parseInt(retentionDays, 10), 'compliance', 'Data retention policy in days');
    }
    if (vaultEnabled !== undefined) {
      await settingsRepository.set('vault_enabled', Boolean(vaultEnabled), 'security', 'Enable HashiCorp Vault for secrets');
    }
    if (vaultAddress !== undefined) {
      await settingsRepository.set('vault_address', vaultAddress, 'security', 'HashiCorp Vault server address');
    }
    if (vaultToken !== undefined && vaultToken !== '***') {
      await settingsRepository.set('vault_token', vaultToken, 'security', 'HashiCorp Vault authentication token');
    }
    if (vaultPath !== undefined) {
      await settingsRepository.set('vault_path', vaultPath, 'security', 'Vault secret mount path');
    }
    if (keycloakEnabled !== undefined) {
      await settingsRepository.set('keycloak_enabled', Boolean(keycloakEnabled), 'security', 'Enable Keycloak federated authentication');
    }
    if (keycloakRealmUrl !== undefined) {
      await settingsRepository.set('keycloak_realm_url', keycloakRealmUrl, 'security', 'Keycloak realm base URL');
    }
    if (keycloakClientId !== undefined) {
      await settingsRepository.set('keycloak_client_id', keycloakClientId, 'security', 'Keycloak client ID');
    }

    await writeAuditLog(req, {
      action: 'COMPLIANCE_SETTINGS_UPDATED',
      resource: 'settings:compliance',
      details: { piiMasking, vaultEnabled, keycloakEnabled },
    });

    res.json({ success: true, message: 'Compliance settings updated' });
  } catch (err) {
    next(err);
  }
});

function validateVaultAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new ValidationError('Vault server address must be a non-empty string');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(address);
  } catch (e) {
    throw new ValidationError('Invalid Vault server URL format');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ValidationError('Vault URL protocol must be http or https');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata',
    '100.100.100.200',
    'instance-data',
  ];

  if (blockedHosts.includes(hostname) || hostname.endsWith('.metadata.google.internal') || hostname.includes('169.254.')) {
    throw new ValidationError('Security restriction: Access to cloud metadata or link-local endpoints is prohibited');
  }

  if (hostname.startsWith('fe80:') || hostname.startsWith('[fe80:')) {
    throw new ValidationError('Security restriction: Link-local IPv6 addresses are prohibited');
  }

  return parsedUrl.origin;
}

function sanitizeVaultPath(vaultPath) {
  if (!vaultPath || typeof vaultPath !== 'string') return 'secret/data/automation';
  const clean = vaultPath.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
  if (clean.includes('..') || clean.includes('\0')) {
    throw new ValidationError('Invalid secret path: Directory traversal characters are prohibited');
  }
  return clean;
}

router.post('/vault/test', requireRole([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const { address, token, path } = req.body;
    const validatedAddress = validateVaultAddress(address);
    const safePath = sanitizeVaultPath(path);

    const testClient = new VaultClient({
      enabled: true,
      address: validatedAddress,
      token,
      path: safePath,
    });

    const secrets = await testClient.getSecrets(true);
    if (!secrets) {
      return res.status(400).json({ success: false, message: 'Could not connect to HashiCorp Vault with provided credentials' });
    }

    res.json({ success: true, message: 'Successfully connected to HashiCorp Vault', keysFound: Object.keys(secrets) });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', requirePermission('audit:read'), async (req, res, next) => {
  try {
    const { action, resource, search, startDate, endDate, dateFrom, dateTo } = req.query;
    const safePage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;
    const result = await auditRepository.listLogs({
      limit: safeLimit,
      offset,
      action,
      resource,
      search,
      startDate: startDate || dateFrom,
      endDate: endDate || dateTo,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
