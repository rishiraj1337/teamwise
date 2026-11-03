'use strict';

const { verifyToken } = require('../../core/security');
const { AuthenticationError } = require('../../core/errors');
const { KeycloakVerifier } = require('../../core/keycloak');
const { settingsRepository } = require('../../database/settingsRepository');
const { resolveUserFromToken, SERVICE_USER_ID } = require('../../core/serviceAccount');

let keycloakVerifier = null;

async function getKeycloakVerifier() {
  if (!keycloakVerifier) {
    const isEnabled = await settingsRepository.get('keycloak_enabled', false);
    const realmUrl = await settingsRepository.get('keycloak_realm_url', '');
    const clientId = await settingsRepository.get('keycloak_client_id', '');
    keycloakVerifier = new KeycloakVerifier({ enabled: isEnabled, realmUrl, clientId });
  }
  return keycloakVerifier;
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new AuthenticationError('Authorization token required');
    }

    // Try Keycloak if configured
    const kv = await getKeycloakVerifier();
    if (kv.enabled) {
      const keycloakUser = await kv.verify(token);
      if (keycloakUser) {
        req.user = keycloakUser;
        return next();
      }
    }

    // Standard native JWT authentication
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (jwtErr) {
      throw new AuthenticationError('Invalid or expired authentication token');
    }

    const serviceUser = resolveUserFromToken(decoded);
    if (serviceUser) {
      req.user = {
        id: serviceUser.id,
        email: serviceUser.email,
        name: serviceUser.name,
        role: serviceUser.role,
        status: serviceUser.status,
      };
      return next();
    }

    if (decoded.id === SERVICE_USER_ID) {
      throw new AuthenticationError('Invalid service account token');
    }

    throw new AuthenticationError('User account not found. Enterprise API uses service credentials only.');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  authenticate,
};
