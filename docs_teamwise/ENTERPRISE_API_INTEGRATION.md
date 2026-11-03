# Enterprise Review Platform — Teamwise UI integration

**Date:** 2026-11-02  
**Primary backend:** `enterprise-review-platform` (Node, `/api/*` via Vite proxy)  
**Auth for HR/workspace:** Teamwise FastAPI (`/api/v1/*`) — login, register, profile, org chart mocks  
**Platform session:** Operations users receive an enterprise JWT via `GET /api/v1/platform/access-token` (bridge user). All review/ingest/admin calls use `Authorization: Bearer` on `/api/*`.

Client module: `teamwise/ui/src/api/enterprise.ts`

---

## API inventory (44 routes)

| # | Method | Path | Integrated | UI surface | Notes |
|---|--------|------|------------|------------|-------|
| 1 | GET | `/health` | No | — | Ops/monitoring only |
| 2 | POST | `/api/auth/login` | Partial | Teamwise backend bridge | Not called directly from browser |
| 3 | POST | `/api/auth/invite/accept` | No | — | No invite-accept screen in Teamwise UI |
| 4 | GET | `/api/auth/me` | Partial | — | Available in `enterprise.ts`; no dedicated page |
| 5 | GET | `/api/reviews` | **Yes** | Reviews and Remarks | List + filters |
| 6 | GET | `/api/reviews/stats` | No | — | Summary stats not on dashboard yet |
| 7 | GET | `/api/reviews/taxonomy` | **Yes** | Reviews and Remarks (edit modal) | Replaces `/api/v1/reviews/taxonomy` for ops |
| 8 | GET | `/api/reviews/analytics` | **Yes** | Overview charts, Reviews filters | Replaces Teamwise analytics |
| 9 | GET | `/api/reviews/export` | **Yes** | Reviews and Remarks (export) | Server CSV with PIVOT sections via `enterpriseDownloadReviewExport()` |
| 10 | PUT | `/api/reviews/:uniqueId` | **Yes** | Review edit modal | Validates against DB taxonomy |
| 11 | GET | `/api/ingestion/email/status` | **Yes** | Integrations | Requires `reviews:read` |
| 12 | GET | `/api/ingestion/email/filtered` | **Yes** | Integrations (quarantine table) | |
| 13 | GET | `/api/ingestion/email/filtered/stats` | **Yes** | Integrations | Total quarantined count |
| 14 | POST | `/api/ingestion/email/trigger` | **Yes** | Integrations | |
| 15 | GET | `/api/ingestion/playstore/status` | **Yes** | Integrations | Requires `reviews:read`; stats include `isScraping` / `lastRunAt` aliases |
| 16 | POST | `/api/ingestion/playstore/trigger` | **Yes** | Integrations | Requires `pipeline:trigger`; runs in-process collector (no separate `playstore-reviews` service) |
| 17 | GET | `/api/chatbot/tickets` | **Yes** | Chatbot tickets | Same handler under `/api/ingestion/chatbot/tickets` |
| 18 | GET | `/api/chatbot/tickets/:id` | **Yes** | Chatbot tickets (detail panel) | |
| 19 | GET | `/api/chatbot/categories` | **Yes** | Chatbot tickets (filter) | Reads `review_category` |
| 20 | GET | `/api/chatbot/stats` | No | — | Could add to Integrations |
| 21 | GET | `/api/chatbot/status` | **Yes** | Integrations | Via `/api/ingestion/chatbot/status` |
| 22 | POST | `/api/chatbot/poll` | **Yes** | Integrations | Manual poll |
| 23 | GET | `/api/admin/users` | **Yes** | Platform settings → Users | Read-only list |
| 24 | PUT | `/api/admin/users/:id/role` | No | — | Admin RBAC UI not built |
| 25 | PUT | `/api/admin/users/:id/status` | No | — | Admin RBAC UI not built |
| 26 | POST | `/api/admin/invites` | No | — | Create-invite form not built |
| 27 | GET | `/api/admin/invites` | **Yes** | Platform settings → Users | List only |
| 28 | DELETE | `/api/admin/invites/:id` | No | — | |
| 29 | GET | `/api/admin/settings/ai` | **Yes** | Platform settings → AI | |
| 30 | PUT | `/api/admin/settings/ai` | **Yes** | Platform settings → AI | Requires enterprise ADMIN role |
| 31 | GET | `/api/admin/settings/polling` | **Yes** | Platform settings → Polling | |
| 32 | PUT | `/api/admin/settings/polling` | **Yes** | Platform settings → Polling | Requires ADMIN |
| 33 | GET | `/api/admin/settings/compliance` | No | — | Compliance UI not built |
| 34 | PUT | `/api/admin/settings/compliance` | No | — | |
| 35 | POST | `/api/admin/vault/test` | No | — | Vault test UI not built |
| 36 | GET | `/api/admin/audit-logs` | **Yes** | Audit log | Action/resource filters; replaces Teamwise audit for ops |
| 37 | GET | `/api/notifications/stream` | No | — | SSE; bell UI is placeholder |
| 38 | POST | `/api/notifications/subscribe` | No | — | Push not wired |
| 39 | POST | `/api/notifications/test` | No | — | |
| 40 | GET | `/api/admin/review-config` | **Yes** | Manage configurations | |
| 41 | POST | `/api/admin/review-config/categories` | **Yes** | Manage configurations | |
| 42 | PATCH | `/api/admin/review-config/categories/:id` | **Yes** | Manage configurations | |
| 43 | POST | `/api/admin/review-config/categories/:id/subcategories` | **Yes** | Manage configurations | |
| 44 | PATCH | `/api/admin/review-config/subcategories/:id` | **Yes** | Manage configurations | |

Duplicate mounts (`/api/ingestion/chatbot/*` → same chatbot router) are not counted separately.

---

## Summary

| Metric | Count |
|--------|------:|
| **Total enterprise API routes** | 44 |
| **Fully integrated in UI** | 28 |
| **Partially integrated** | 4 (#2 bridge, #4 me, #9 export helper unused in primary flow, #21 alias path) |
| **Not integrated** | 12 |
| **Integration coverage (full / total)** | **63.6%** |
| **Integration coverage (full + partial / total)** | **72.7%** |

---

## Conflict resolution (Teamwise vs enterprise)

| Concern | Winner | Implementation |
|---------|--------|----------------|
| Review list / update | Enterprise | `fetchReviewsUnified`, `updateReviewUnified` → `enterprise.ts` only |
| Taxonomy & analytics | Enterprise | `GET /api/reviews/taxonomy`, `/analytics` |
| Classification config | Enterprise | `/api/admin/review-config/*` |
| Audit log (Operations) | Enterprise | `GET /api/admin/audit-logs` |
| Ingestion & chatbot | Enterprise | Integrations + Chatbot tickets pages |
| Login / HR / registration | Teamwise | Unchanged `/api/v1/auth/*` |

Legacy Teamwise review/audit/config endpoints remain in the codebase for non-operations paths but are **not** used for Operations workspace flows.

---

## Enterprise backend additions for this integration

See `enterprise-review-platform/changes.md` (section **2026-11-02 — Teamwise UI primary backend**):

- `GET /api/reviews/taxonomy`, `GET /api/reviews/analytics`
- `GET/POST/PATCH /api/admin/review-config/*`
- Review list filters: `priority`, `status`
- `src/services/reviewAnalytics.js`, `src/database/reviewConfigRepository.js`, `src/server/routes/reviewConfigRoutes.js`

---

## Prerequisites

1. Enterprise Node app on `:3000` with `timePayReview` DB.
2. Teamwise backend `.env`: `ENTERPRISE_API_URL`, `ENTERPRISE_BRIDGE_EMAIL`, `ENTERPRISE_BRIDGE_PASSWORD` (enterprise user with `audit:read`, `reviews:*`, `settings:*`, `pipeline:trigger` as needed).
3. Vite proxy: `/api` → `:3000`, `/api/v1` → `:8000`.

---

## Audit log verification

- Enterprise writes audit rows on login, review update, exports, settings changes, chatbot poll, etc. (`audit_logs` table).
- **Audit log** page loads **`GET /api/admin/audit-logs`** with optional `action` and `resource` query params.
- Confirm bridge user has **`audit:read`** (ADMIN/MANAGER roles).

---

## Remaining gaps (recommended follow-ups)

1. Platform admin: user role/status, invite create/revoke, compliance + vault screens.
2. Wire **Export** button to `GET /api/reviews/export` (server-side audit already logged there).
3. Dashboard: `GET /api/reviews/stats` and `GET /api/chatbot/stats`.
4. Web push: `/api/notifications/*` when product needs real notifications.
5. Public **invite accept** flow if enterprise invites replace Teamwise self-registration for platform users.
