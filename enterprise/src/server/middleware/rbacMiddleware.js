'use strict';

const { ROLE_PERMISSIONS } = require('../../config/constants');
const { ForbiddenError } = require('../../core/errors');

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Action requires one of the following roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userPermissions.includes(permission)) {
      return next(new ForbiddenError(`User role (${req.user.role}) lacks permission: ${permission}`));
    }

    next();
  };
}

module.exports = {
  requireRole,
  requirePermission,
};
