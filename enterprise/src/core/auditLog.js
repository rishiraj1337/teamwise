'use strict';

const { auditRepository } = require('../database/auditRepository');

function resolveAuditActor(req) {
  const headerEmail = req.get('x-teamwise-actor-email')?.trim();
  if (headerEmail) {
    return {
      userId: null,
      userEmail: headerEmail.slice(0, 191),
      actorEmpId: req.get('x-teamwise-actor-emp-id')?.trim()?.slice(0, 64) || null,
      actorName: req.get('x-teamwise-actor-name')?.trim()?.slice(0, 100) || null,
    };
  }

  return {
    userId: req.user?.id ?? null,
    userEmail: req.user?.email ?? 'system',
    actorEmpId: null,
    actorName: req.user?.name ?? null,
  };
}

async function writeAuditLog(req, { action, resource, details = null }) {
  const actor = resolveAuditActor(req);
  const payload =
    details && typeof details === 'object'
      ? {
          ...details,
          ...(actor.actorEmpId ? { actor_emp_id: actor.actorEmpId } : {}),
          ...(actor.actorName ? { actor_name: actor.actorName } : {}),
        }
      : details;

  await auditRepository.log({
    userId: actor.userId,
    userEmail: actor.userEmail,
    action,
    resource,
    details: payload,
    ipAddress: req.ip || '127.0.0.1',
  });
}

module.exports = {
  resolveAuditActor,
  writeAuditLog,
};
