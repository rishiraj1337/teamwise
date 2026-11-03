'use strict';

const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

class KeycloakVerifier {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.realmUrl = (options.realmUrl || '').replace(/\/+$/, '');
    this.clientId = options.clientId || '';
    this.publicKeys = new Map();
    this.lastFetched = 0;
  }

  async fetchCerts() {
    if (!this.enabled || !this.realmUrl) return;
    try {
      const certsUrl = `${this.realmUrl}/protocol/openid-connect/certs`;
      const response = await axios.get(certsUrl, { timeout: 5000 });
      const keys = response.data?.keys || [];
      for (const k of keys) {
        if (k.kid && k.x5c && k.x5c[0]) {
          const cert = `-----BEGIN CERTIFICATE-----\n${k.x5c[0]}\n-----END CERTIFICATE-----`;
          this.publicKeys.set(k.kid, cert);
        }
      }
      this.lastFetched = Date.now();
      logger.info({ keyCount: this.publicKeys.size }, 'Keycloak public certificates refreshed');
    } catch (err) {
      logger.warn({ error: err.message }, 'Failed to fetch Keycloak certificates');
    }
  }

  async verify(tokenString) {
    if (!this.enabled) return null;
    const decoded = jwt.decode(tokenString, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return null;
    }

    if (!this.publicKeys.has(decoded.header.kid) || Date.now() - this.lastFetched > 3600000) {
      await this.fetchCerts();
    }

    const key = this.publicKeys.get(decoded.header.kid);
    if (!key) return null;

    try {
      const verified = jwt.verify(tokenString, key, { algorithms: ['RS256'] });
      return {
        id: verified.sub,
        email: verified.email || verified.preferred_username,
        name: verified.name || verified.preferred_username || 'Keycloak User',
        role: this.mapRole(verified),
        isKeycloak: true,
      };
    } catch (err) {
      logger.warn({ error: err.message }, 'Keycloak token verification failed');
      return null;
    }
  }

  mapRole(verified) {
    const roles = verified.realm_access?.roles || [];
    if (roles.includes('admin')) return 'ADMIN';
    if (roles.includes('manager')) return 'MANAGER';
    if (roles.includes('analyst')) return 'ANALYST';
    return 'VIEWER';
  }
}

module.exports = {
  KeycloakVerifier,
};
