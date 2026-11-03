'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootEnv = path.resolve(process.cwd(), '.env');
const parentEnv = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else if (fs.existsSync(parentEnv)) {
  dotenv.config({ path: parentEnv });
} else {
  dotenv.config();
}

function parseInteger(val, fallback) {
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(val, fallback = false) {
  if (val === undefined || val === null || val === '') return fallback;
  return String(val).toLowerCase() === 'true' || val === '1';
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: parseInteger(process.env.PORT, 3000),
  HOST: process.env.HOST || '0.0.0.0',

  JWT_SECRET: process.env.JWT_SECRET || 'timepay-secure-enterprise-jwt-key-change-in-production-2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  /** API login for Teamwise bridge / automation (no users table in timePayReview). */
  ENTERPRISE_SERVICE_EMAIL:
    process.env.ENTERPRISE_SERVICE_EMAIL ||
    process.env.ENTERPRISE_BRIDGE_EMAIL ||
    'admin@company.com',
  ENTERPRISE_SERVICE_PASSWORD:
    process.env.ENTERPRISE_SERVICE_PASSWORD ||
    process.env.ENTERPRISE_BRIDGE_PASSWORD ||
    'AdminPassword123!',
  ENTERPRISE_SERVICE_NAME: process.env.ENTERPRISE_SERVICE_NAME || 'Enterprise API Service',

  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInteger(process.env.DB_PORT, 3306),
  DB_USER: process.env.DB_USER || 'review_user',
  DB_PASSWORD: process.env.DB_PASSWORD || 'review_pass',
  DB_NAME: process.env.DB_NAME || 'review_db',
  DATABASE_URL: process.env.DATABASE_URL || '',
  DB_CONNECTION_LIMIT: parseInteger(process.env.DB_CONNECTION_LIMIT, 10),
  DB_CONNECT_TIMEOUT: parseInteger(process.env.DB_CONNECT_TIMEOUT, 10000),

  UPLOADS_DIR: process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'data/uploads'),
  PROCESSED_DIR: process.env.PROCESSED_DIR || path.resolve(process.cwd(), 'data/uploads/processed'),
  FAILED_DIR: process.env.FAILED_DIR || path.resolve(process.cwd(), 'data/uploads/failed'),
  NON_SUPPORT_DIR: process.env.NON_SUPPORT_DIR || path.resolve(process.cwd(), 'data/uploads/non-support'),

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  OPENROUTER_TIMEOUT_MS: parseInteger(process.env.OPENROUTER_TIMEOUT_MS, 30000),

  POLL_INTERVAL_SECONDS: parseInteger(process.env.POLL_INTERVAL_SECONDS, 10),
  POLL_ON_START: parseBoolean(process.env.POLL_ON_START, true),

  APP_PACKAGE_NAME: process.env.APP_PACKAGE_NAME || 'com.npst.timepay.society',
  REVIEW_COUNTRY: process.env.REVIEW_COUNTRY || 'in',
  REVIEW_LANGUAGES: process.env.REVIEW_LANGUAGES ? process.env.REVIEW_LANGUAGES.split(',').map(s => s.trim()) : ['en', 'hi'],
  INITIAL_IMPORT_DAYS: parseInteger(process.env.INITIAL_IMPORT_DAYS, 30),
  OVERLAP_DAYS: parseInteger(process.env.OVERLAP_DAYS, 7),
  MAX_REVIEWS_PER_LANGUAGE: parseInteger(process.env.MAX_REVIEWS_PER_LANGUAGE, 5000),
  PLAYSTORE_POLL_INTERVAL_MINUTES: parseInteger(process.env.PLAYSTORE_POLL_INTERVAL_MINUTES, 60),

  VAULT_ENABLED: parseBoolean(process.env.VAULT_ENABLED, false),
  VAULT_ADDR: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
  VAULT_TOKEN: process.env.VAULT_TOKEN || '',
  VAULT_PATH: process.env.VAULT_PATH || 'secret/data/automation',

  KEYCLOAK_ENABLED: parseBoolean(process.env.KEYCLOAK_ENABLED, false),
  KEYCLOAK_REALM_URL: process.env.KEYCLOAK_REALM_URL || '',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || '',

  // GitHub Repository Email Ingestion
  GITHUB_EMAIL_REPO_URL: process.env.GITHUB_EMAIL_REPO_URL || 'https://github.com/rishiraj1337/teamwise',
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER || '',
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME || '',
  GITHUB_EMAIL_BRANCH: process.env.GITHUB_EMAIL_BRANCH || 'main',
  GITHUB_EMAIL_FOLDER_PATH: process.env.GITHUB_EMAIL_FOLDER_PATH || 'data/incoming-emails',
  GITHUB_PAT: process.env.GITHUB_PAT || '',
  EMAIL_POLLING_ENABLED: parseBoolean(process.env.EMAIL_POLLING_ENABLED, true),
  EMAIL_POLL_INTERVAL_SECONDS: parseInteger(process.env.EMAIL_POLL_INTERVAL_SECONDS, 30),
  EMAIL_MAX_POLL_INTERVAL_SECONDS: parseInteger(process.env.EMAIL_MAX_POLL_INTERVAL_SECONDS, 180),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || path.resolve(process.cwd(), 'logs/app.log'),
};

module.exports = env;
