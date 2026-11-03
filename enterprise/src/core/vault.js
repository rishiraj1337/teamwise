'use strict';

const axios = require('axios');
const logger = require('./logger');
const env = require('../config/env');

class VaultClient {
  constructor(config = {}) {
    this.enabled = config.enabled ?? env.VAULT_ENABLED;
    this.address = (config.address ?? env.VAULT_ADDR).replace(/\/+$/, '');
    this.token = config.token ?? env.VAULT_TOKEN;
    this.secretPath = config.path ?? env.VAULT_PATH;
    this.cachedSecrets = null;
    this.cacheTimestamp = 0;
    this.ttlMs = 5 * 60 * 1000; // 5 minute cache
  }

  async getSecrets(forceRefresh = false) {
    if (!this.enabled) {
      return null;
    }

    const now = Date.now();
    if (!forceRefresh && this.cachedSecrets && (now - this.cacheTimestamp < this.ttlMs)) {
      return this.cachedSecrets;
    }

    try {
      const url = `${this.address}/v1/${this.secretPath}`;
      const response = await axios.get(url, {
        headers: {
          'X-Vault-Token': this.token,
        },
        timeout: 5000,
      });

      const data = response.data?.data?.data || response.data?.data || {};
      this.cachedSecrets = data;
      this.cacheTimestamp = now;
      logger.info({ path: this.secretPath }, 'Retrieved secrets from HashiCorp Vault');
      return data;
    } catch (err) {
      logger.warn({ error: err.message }, 'Failed to fetch secrets from HashiCorp Vault. Falling back to local configuration.');
      return null;
    }
  }

  async getSecret(key, fallback = null) {
    const secrets = await this.getSecrets();
    if (secrets && secrets[key] !== undefined) {
      return secrets[key];
    }
    return fallback;
  }
}

const defaultVaultClient = new VaultClient();

module.exports = {
  VaultClient,
  vaultClient: defaultVaultClient,
};
