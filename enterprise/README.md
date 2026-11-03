# Enterprise Unified Review Platform

A robust, production-grade Node.js monorepo for automated feedback ingestion, review synchronization, AI categorization, and compliance audit management.

## Architectural Overview

The platform is organized into three decoupled intake modules, an isolated AI layer, an abstracted database layer, dynamic runtime configuration, and a minimal web management UI.

```
automation/
├── .env.example                 # Production environment variable template
├── .gitignore
├── Dockerfile                   # Hardened multi-stage non-root container
├── docker-compose.yml           # MySQL 8.4 database + application orchestrator
├── package.json
├── README.md
├── sql/
│   ├── 01_init_schema.sql       # Idempotent database schema definitions
│   └── 02_seed_data.sql         # Seed parameters and dynamic configuration
├── src/
│   ├── index.js                 # Unified bootstrap and graceful shutdown
│   ├── config/
│   │   ├── env.js               # Environment parameter validation
│   │   └── constants.js         # RBAC roles, default enums, permissions
│   ├── core/
│   │   ├── logger.js            # Structured JSON logger (no emojis)
│   │   ├── errors.js            # Normalized domain error classes
│   │   ├── security.js          # Bcrypt hashing, JWT tokens, PII masking
│   │   ├── vault.js             # Optional HashiCorp Vault secrets client
│   │   └── keycloak.js          # Optional Keycloak federated auth verifier
│   ├── database/
│   │   ├── connection.js        # Connection pool with health checks
│   │   ├── migrator.js          # Automated schema migrations and seeding
│   │   ├── reviewRepository.js  # Review storage, TPR sequencing, filters
│   │   ├── settingsRepository.js# Dynamic database flags, AI enums, polling
│   │   ├── userRepository.js    # User credentials and RBAC assignments
│   │   ├── inviteRepository.js  # User invitations and acceptance tokens
│   │   └── auditRepository.js   # Immutable compliance audit trail
│   ├── ai/
│   │   ├── aiService.js         # OpenRouter client with strict JSON schema
│   │   ├── promptBuilder.js     # System prompts enforcing dynamic enums
│   │   └── heuristicClassifier.js # Local fallback classifier
│   ├── modules/
│   │   ├── email-ingestion/     # Part 1: SFTP/Directory file watcher
│   │   ├── playstore-reviews/   # Part 2: Google Play Store scraper & sync (every N days)
│   │   └── chatbot-polling/     # Part 3: Polling service for external chatbot feedback
│   ├── server/
│   │   ├── server.js            # Express application with security headers
│   │   ├── middleware/          # Auth, RBAC, and audit log middlewares
│   │   ├── routes/              # RESTful API endpoints
│   │   └── public/              # Minimal single-page UI and service worker
│   └── jobs/
│       ├── scheduler.js         # Configurable interval polling runner (on start + every N days)
│       └── notificationDispatcher.js # Desktop push notifications & SSE stream
└── test/
    ├── test-ai.js               # AI prompt and heuristic classifier tests
    ├── test-auth.js             # Authentication, RBAC, and PII masking tests
    └── test-pipeline.js         # Ingestion parsing and normalization tests
```

## The Three Intake Modules

### 1. Email Ingestion and Parsing
- Monitors the upload directory (`data/uploads`) for incoming JSON email payloads.
- Extracts email subject, sender, body text, priority, and timestamps.
- Cleans and strips HTML formatting.
- Passes email text through the AI layer (or heuristic engine).
- Masks PII (emails, phone numbers, payment card numbers) when compliance mode is enabled.
- Moves ingested files to `data/uploads/processed` or `data/uploads/failed`.

### 2. Google Play Store Reviews (Scraped on Start + Every N Days)
- Collects user reviews using `google-play-scraper`.
- Scraped immediately on application startup if `polling_playstore_scrape_on_start` is enabled.
- Polled on a recurring schedule every N minutes (configurable via `polling_playstore_interval_minutes`; 1440 = one day).
- Supports multi-language collection with incremental timestamp checkpoints (`review_collection_checkpoint`).
- Deduplicates incoming reviews using `review_source_id_map`.
- Automatically assigns sequential `TPR0001` format identifiers via `review_id_sequence`.
- Records compliance audit logs (`PLAYSTORE_POLL_EXECUTED`) on every run.

### 3. TimePay Chatbot Complaint Polling & Interactive Messenger (Part 3)
- Periodically polls the TimePay Chatbot service endpoint (`https://notification.timepayonline.com:8443/webListChatBot?page=0&size=20`).
- Fetches active categories from `https://notification.timepayonline.com:8443/api/categories`.
- Authenticates using standard session headers with configurable TLS certificate validation.
- Polled on application startup if `polling_chatbot_poll_on_start` is enabled, then runs recurringly every N hours (configurable in Admin Polling Settings).
- Ingests customer tickets across transaction types (`BBPS`, `P2M`, `P2P`) into `chatbot_sessions`.
- Synthesizes user feedback text from `chatDetails` (customer concern descriptions, debit remarks, failure notices), evaluates star ratings (using explicit `ratingApp` or failed transaction heuristics), and maps to the unified review database (`channel = 'Chatbot'`) with sequential `TPRxxxx` IDs.
- Dedicated UI: **Chatbot Complaints** navigation view with master-detail layout:
  - Search by Ticket ID, Customer Name, Mobile Number, RRN, or Txn ID.
  - Filter by Transaction Type (`BBPS`, `P2M`, `P2P`), Category, and Status (`Open`, `Closed`, `In-Progress`).
  - Interactive Messenger transcript displaying complete conversation turns with Bot and User avatars, timestamps, transaction metadata, and direct link to the corresponding Review record.
- Records compliance audit logs (`CHATBOT_POLL_EXECUTED`) on every poll cycle.

## AI Layer and Database Layer Decoupling

- The AI layer is completely decoupled from database access and transport logic.
- AI configuration is driven by database flags and values stored in `system_settings`.
- Admins can modify the active provider (`openrouter` vs `heuristic`), model identifier, API key, and schema enums without restarting the application.
- Category and Subcategory Enums: Administrators can dynamically add or remove allowed categories and subcategories in the Admin UI. The prompt builder injects these dynamic enums into the model prompt to ensure strict classification.

## Authentication, RBAC, and Collaborator Invitations

- Built-in authentication using salted Bcrypt password hashing and JWT access tokens.
- Role-Based Access Control (RBAC):
  - `ADMIN`: Full access to settings, user management, invitations, audit logs, and review mutations.
  - `MANAGER`: Review management, manual pipeline triggers, and audit log inspection.
  - `ANALYST`: Review search, analytics, and JSON/CSV data export.
  - `VIEWER`: Read-only access to reviews.
- Collaborator Invitations: Admins invite colleagues via email with a designated RBAC role. The system generates a single-use token with an expiration timestamp for registration.
- Default Admin Account: Initialized automatically on first migration:
  - Email: `admin@company.com`
  - Password: `AdminPassword123!`

## Desktop Push Notifications

- Server-Sent Events (SSE) stream (`/api/notifications/stream`) delivers real-time notifications to the browser.
- Web Notifications API and Service Worker (`/sw.js`) trigger native desktop alerts for:
  - Critical customer reviews (1-star or 2-star ratings).
  - Urgent priority tickets.
  - New Google Play Store sync batches.
- A test button in the UI allows instant verification of desktop alerts.

## Compliance and Organizational Security

- Audit Trail: Immutable logging in `audit_logs` records every configuration change, review edit, user status modification, poll run, and data export.
- Audit Filter: Filter logs by action and resource directly within the Admin UI.
- PII Masking: Automatic redaction of sensitive identifiers in customer feedback strings.
- Optional HashiCorp Vault Integration: Securely load secrets from HashiCorp Vault KV v2 engine (`vault.js`).
- Optional Keycloak Integration: Validate federated OpenID Connect JWT tokens from Keycloak realms (`keycloak.js`).

## Docker Deployment

To launch the entire platform in Docker:

```sh
docker-compose up -d --build
```

The stack initializes:
- `mysql`: MySQL 8.4 database with healthy checks and automated schema initialization (`sql/01_init_schema.sql` and `sql/02_seed_data.sql`).
- `app`: Hardened Node.js container running as non-root user `node` on port 3000.

Access the UI at:
```
http://localhost:3000
```

## Running Verification Tests

```sh
npm test
npm run test:auth
npm run test:ai
```
