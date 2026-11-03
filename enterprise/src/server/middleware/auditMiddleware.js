'use strict';

const { auditRepository } = require('../../database/auditRepository');

function audit(action, resourceGetter = () => 'system') {
  return async (req, res, next) => {
    // Let the route handler finish, then record audit log
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const resource = typeof resourceGetter === 'function' ? resourceGetter(req) : resourceGetter;
      const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

      auditRepository.log({
        userId: req.user?.id || null,
        userEmail: req.user?.email || 'anonymous',
        action,
        resource: String(resource),
        details: {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
        },
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress.split(',')[0].trim(),
      }).catch(() => {});

      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  audit,
};
