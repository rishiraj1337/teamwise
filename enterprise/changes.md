# Enterprise Review Platform — change log

All modifications made to this repository (relative to the upstream **enterprise-unified-review-platform** baseline) must be recorded here when you change SQL, config, ingest, routes, or shared taxonomy behavior.

---

## 2026-11-02 — Teamwise integration

### Config

- Added `.env.local.example` — shared **`timePayReview`** on MySQL port **3306** (aligned with Teamwise / playstore-reviews).

### API

- **`src/server/routes/reviewRoutes.js`** — `PUT /api/reviews/:uniqueId` accepts full operational fields: `category`, `subcategory`, `response_timestamp`, `developer_reply_text`, `developer_reply_time`, `review_link` (in addition to `status`, `resolution`, `department`, `priority`).

### Related (not in this repo)

- **Teamwise UI**: Vite proxy `/api/v1` → FastAPI `:8000`, `/api` → enterprise `:3000`; Integrations page; unified reviews via platform token from `GET /api/v1/platform/access-token` (Teamwise backend bridge).

---

## 2026-11-02 — Taxonomy sync (timePayReview + Teamwise + enterprise)

### SQL

| File | Purpose |
|------|---------|
| `sql/03_review_taxonomy_sync.sql` | Mirror of `playstore-reviews/sql/005_sync_review_taxonomy.sql` — priorities **Low, Medium, High, Urgent**; `review_status` (**New, In Progress, Resolved, Closed, N/A**); normalize legacy `review` priority/status and Play Store labels; refresh `priority_id` FKs. |
| `sql/04_ingestion_taxonomy.sql` | Mirror of `playstore-reviews/sql/006_ingestion_taxonomy.sql` — seed chatbot/email category names and subcategories; insert missing pairs from `review` (Chatbot / Email-SFTP) and `chatbot_sessions`; backfill `category_id` / `subcategory_id`. |
| `sql/05_migrate_chatbot_categories.sql` | One-time: copy legacy `chatbot_categories` → `review_category`, ensure `General` subcategory, **drop** `chatbot_categories`. |
| `sql/02_seed_data.sql` | AI settings (`ai_categories`, `ai_subcategories`) aligned with operational `review_category` / `review_subcategory` (not legacy Billing/Performance enums). |
| `sql/01_init_schema.sql` | Removed `chatbot_categories` table (chatbot catalog lives in `review_category` only). |

### Migrations on startup

- **`src/database/migrator.js`** — runs `01_init_schema.sql`, `02_seed_data.sql`, `03_review_taxonomy_sync.sql`, `04_ingestion_taxonomy.sql`; runs `05_migrate_chatbot_categories.sql` only if legacy `chatbot_categories` still exists; then `loadTaxonomy(true)`.

### Runtime — taxonomy & reviews

- **`src/database/taxonomyRepository.js`** (new) — load priorities, statuses, categories, subcategories from MySQL; `normalizeStatus()`; `validateReviewFields()` for PUT; `ensureCategorySubcategory()` for ingest; fallback defaults include chatbot category names (P2P/P2M/BBPS-style labels).
- **`src/database/reviewRepository.js`** — after each `upsertReview`, calls `ensureCategorySubcategory` and sets `category_id` / `subcategory_id` on `review`.
- **`src/config/constants.js`** — category/subcategory defaults sourced from `taxonomyRepository`; `PRIORITY_LEVELS` / `STATUS_OPTIONS` match DB.
- **`src/server/routes/reviewRoutes.js`** — validates PUT bodies against DB taxonomy before upsert.

### Runtime — channel ingest & classification

- **`src/modules/playstore-reviews/normalizeReview.js`** — Play Store: category **Playstore review**, subcategories **Positive/Negative**, priority **1–2★ → Medium**, **3–5★ → Low**, status **New**.
- **`src/ai/heuristicClassifier.js`** — email heuristics: **Status Enquiry**, **Technical**, **UPI Lite**; priorities **Low / Medium / High / Urgent**.

### Runtime — chatbot categories (no separate table)

- **`src/database/chatbotRepository.js`** — `saveCategories()` upserts TimePay API categories into **`review_category`** and **`review_subcategory`** (via `ensureCategorySubcategory`); `getCategories()` reads active rows from **`review_category`**.
- **`src/modules/chatbot-polling/chatbotPollingService.js`** — category poll still calls `saveCategories()` (now writes taxonomy tables).
- **`src/server/routes/chatbotRoutes.js`** — `GET /api/chatbot/categories` unchanged path; data source is `review_category`.

### Related repos (not in this folder)

- **playstore-reviews**: `002_classification_tables.sql`, `005`, `006`, `007_migrate_chatbot_categories.sql` via `scripts/apply-classification-migration.sh`.
- **teamwise**: `review_status` model, taxonomy API, UI status dropdown, four-priority validation.

---

## How to apply taxonomy SQL manually

```bash
docker exec -i timepay-review-mysql mysql -uroot -ppassword timePayReview \
  < sql/03_review_taxonomy_sync.sql

docker exec -i timepay-review-mysql mysql -uroot -ppassword timePayReview \
  < sql/04_ingestion_taxonomy.sql

# Only if legacy table still exists:
docker exec -i timepay-review-mysql mysql -uroot -ppassword timePayReview \
  < sql/05_migrate_chatbot_categories.sql
```

Or restart the Node service so `runMigrations()` applies pending scripts on boot.

---

## Canonical reference (keep in sync)

| Field | Allowed values |
|-------|----------------|
| **Priority** | Low, Medium, High, Urgent |
| **Status** | New, In Progress, Resolved, Closed, N/A |
| **Categories** | Playstore review, Status Enquiry, Technical, UPI Lite, plus chatbot/email labels in `04_ingestion_taxonomy.sql` / TimePay category poll |
| **Subcategories** | See `playstore-reviews/sql/002_classification_tables.sql`, `006_ingestion_taxonomy.sql`, and per-category seeds from ingest |

**Databases:** `teamwisedb` = Teamwise auth/RBAC only. Review data and taxonomy = **`timePayReview`** (port 3306).

---

## 2026-11-02 — Teamwise UI primary backend

### New / extended HTTP API

- **`GET /api/reviews/taxonomy`** — priorities, categories/subcategories, statuses from `loadTaxonomy()`.
- **`GET /api/reviews/analytics`** — dashboard aggregates + `filter_options` (mirrors Teamwise analytics shape).
- **`GET/POST/PATCH /api/admin/review-config`** — classification CRUD on `review_category` / `review_subcategory` (replaces Teamwise `/api/v1/review-config` for Operations UI).
- **`GET /api/reviews`** — query params **`priority`**, **`status`** added to list filters; **`search`** spans category, department, resolution, developer reply; star rating range via **`minStarRating`** / **`maxStarRating`**.
- **`GET /api/reviews/export`** — same filters as list; CSV includes all row columns plus **PIVOT_** analytics sections (category, priority, sentiment, ticket status, category detail).
- **`src/services/reviewExport.js`** — filtered export builder with pivot summary blocks.

### Documentation (Teamwise repo)

- **`src/services/reviewAnalytics.js`** — SQL aggregations for `/api/reviews/analytics`.
- **`src/database/reviewConfigRepository.js`** — category/subcategory CRUD + cache refresh.
- **`src/server/routes/reviewConfigRoutes.js`** — mounted at `/api/admin/review-config` in **`src/server/server.js`**.

### Documentation (Teamwise repo)

- **`teamwise/docs/ENTERPRISE_API_INTEGRATION.md`** — full API matrix, integration counts (~64% full coverage), UI mapping, audit notes.

---

## 2026-11-02 — Play Store single-backend consolidation

Standalone **`playstore-reviews/`** can be removed. Play Store scrape, dedupe, TPR IDs, checkpoints, and classification rules run inside **`enterprise-review-platform`** only (`timePayReview` on port **3306**).

### Rules (canonical)

Documented in **`src/modules/playstore-reviews/PLAYSTORE_INGEST_RULES.md`**. Implemented in **`playstoreClassification.js`** and applied on normalize, upsert, and when AI is off or fails.

| Field | Rule |
|-------|------|
| Channel | `Google Playstore` |
| Category | `Playstore review` |
| Subcategory | 1–3★ Negative, 4–5★ Positive |
| Priority | 1–2★ Medium, 3–5★ Low |
| Status | `New` |
| Resolution | `N/A` |
| Department | ≤2★ Engineering, else Customer Support |

### Code / SQL

- **`reviewCollector.js`** — FK columns on insert; lazy `GooglePlayClient`; **`getStats()`** exposes Teamwise-friendly aliases (`isScraping`, `lastRunAt`, `totalScraped`).
- **`googlePlayClient.js`** — validation aligned with former TypeScript scraper.
- **`sql/06_review_classification_fks.sql`**, **`sql/07_playstore_priority_from_star_rating.sql`** — applied via **`migrator.js`**.
- **`test/test-playstore-classification.js`** — included in **`npm test`**.

### HTTP API protection

All **`/api/*`** review, ingestion, chatbot, admin, and review-config routes require **`authenticate`** plus RBAC permissions (except public **`/health`**, **`POST /api/auth/login`**, **`POST /api/auth/invite/accept`**).

- **`GET /api/ingestion/playstore/status`** — `reviews:read`
- **`POST /api/ingestion/playstore/trigger`** — `pipeline:trigger`
- **`GET /api/ingestion/email/status`** — `reviews:read` (route only; email-ingestion module unchanged)

### Auth model with Teamwise

HR login stays on **Teamwise FastAPI** (`/api/v1/*`). Operations UI calls enterprise **`/api/*`** with the JWT from **`GET /api/v1/platform/access-token`** (bridge service account on enterprise). Do not run a second Play Store worker.

---

## 2026-11-03 — Polling intervals in minutes + settings cache fix

### Problem

After saving Platform → Polling (Teamwise UI or enterprise admin), interval fields snapped back to defaults (email 1 min, Play Store 1440, chatbot 60). Values were written to MySQL correctly, but reads within the 15s settings cache returned the wrong shape. A second issue: the Teamwise save payload used hardcoded `?? 1 / 1440 / 60` fallbacks, which could overwrite stored intervals when minute fields were missing from state (legacy API shape or hidden interval inputs).

### SQL

| File | Purpose |
|------|---------|
| `sql/09_polling_interval_minutes.sql` | Keys `polling_*_interval_minutes`; migrates from legacy seconds/days/hours when minute rows are missing. |
| `sql/02_seed_data.sql` | Seed defaults use minute keys (1440 = 1 day for Play Store). |

### Backend

- **`src/database/settingsRepository.js`** — `getPollingConfig()` exposes `emailIntervalMinutes`, `playstoreIntervalMinutes`, `chatbotIntervalMinutes` (legacy keys still read as fallback). **`settingValue()`** reads settings whether cached entries are `{ value }` objects or raw scalars. **`getAllSettings()` cache hit** wraps entries as `{ value, ... }`. **`set()`** clears the cache after each write so the next read loads from MySQL.
- **`src/jobs/scheduler.js`** — schedules use `minutes × 60 × 1000` (minimum 1 minute).
- **`src/server/routes/adminRoutes.js`** — PUT `/api/admin/settings/polling` requires **`settings:write`** (enterprise **ADMIN** only; set `ENTERPRISE_BRIDGE_EMAIL` to an ADMIN user). Persists minute keys and syncs legacy seconds/days/hours for older rows. Forces settings reload after polling/AI PUT.
- **`src/database/migrator.js`** — runs `09_polling_interval_minutes.sql`.
- **`test/test-settings-cache.js`** — regression test for cached settings shape.

### Admin UI (enterprise)

- **`src/server/public/app.js`**, **`index.html`** — polling form labels and API fields use `*IntervalMinutes`.

### Teamwise UI

- **`teamwise/ui/src/api/enterprise.ts`** — `normalizePollingConfig()` / `buildPollingSettingsPayload()` map legacy seconds/days/hours to minutes on GET/PUT.
- **`teamwise/ui/src/features/platform/PlatformSettingsPage.tsx`** — intervals in minutes; save uses `buildPollingSettingsPayload()`; applies PUT response to state.

### Ops note

Restart **enterprise-review-platform** after pulling backend changes. Rebuild or refresh Teamwise UI so Platform settings uses the updated client. Bridge login must be an enterprise user with role **ADMIN** (`settings:write`).

---

## 2026-11-03 — Teamwise-only user accounts + Manage categories rename

### SQL (timePayReview)

| File | Purpose |
|------|---------|
| `sql/10_drop_enterprise_user_tables.sql` | Drops `users` and `user_invites` from **timePayReview** (HR accounts live in **teamwisedb** only). |
| `sql/01_init_schema.sql` | Removed `users` / `user_invites` table definitions from fresh installs. |

### Enterprise backend

- **`src/core/serviceAccount.js`** — `POST /api/auth/login` uses env **`ENTERPRISE_SERVICE_EMAIL`** / **`ENTERPRISE_SERVICE_PASSWORD`** (falls back to `ENTERPRISE_BRIDGE_*`). No rows in MySQL for API operators.
- **`src/server/routes/authRoutes.js`** — Removed DB user login and invite acceptance (410 → use Teamwise).
- **`src/server/middleware/authMiddleware.js`** — JWT resolves service account from token payload (no `users` table).
- **`src/server/routes/adminRoutes.js`** — Removed `/api/admin/users` and `/api/admin/invites`.
- **`src/database/migrator.js`** — Runs `10_drop_enterprise_user_tables.sql`; no admin user seed.
- **`src/config/env.js`** — Service account env vars documented via `.env.local.example`.

### Teamwise backend

- **`GET /api/v1/admin/users`** — Lists users from **teamwisedb** (Operations access). Used by Platform settings → Users.

### Teamwise UI

- **`PlatformSettingsPage.tsx`** — Users tab loads **`fetchTeamwiseDirectoryUsers()`**; removed enterprise invites list.
- **Nav / page title** — **Manage configurations** renamed to **Manage categories** (`ManageConfigurationsPage` heading updated).

### Docs

- **`changes.md`** — This section.

