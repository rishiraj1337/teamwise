# Enterprise Unified Review Platform - REST API Reference

**Version:** 2.1.0  
**Base URL:** `http://<host>:<port>` (Default: `http://localhost:3000`)  
**Security:** JSON Web Tokens (JWT) / Keycloak Bearer Token  
**Content-Type:** `application/json` (except file export / SSE streams)

---

## 1. Global Standards & Conventions

### 1.1 Authentication & Authorization
All endpoints except `/health`, `/api/auth/login`, and `/api/auth/invite/accept` require an `Authorization` header:
```http
Authorization: Bearer <jwt_token>
```
For Server-Sent Events (SSE) connections where HTTP headers cannot be set natively by the browser `EventSource` interface, authentication token may be passed as a query string parameter:
```http
GET /api/notifications/stream?token=<jwt_token>
```

### 1.2 Rate Limiting Protection
In-memory sliding window rate limits are enforced automatically:
| Endpoint Scope | Window | Limit | Response on Exceeded |
|---|---|---|---|
| Authentication (`/api/auth/*`) | 60 seconds | 10 requests / IP | `HTTP 429 Too Many Requests` |
| General REST API (`/api/*`) | 60 seconds | 300 requests / IP | `HTTP 429 Too Many Requests` |

Rate limit headers returned:
- `X-RateLimit-Limit`: Maximum requests allowed in current window
- `X-RateLimit-Remaining`: Remaining request allowance
- `X-RateLimit-Reset`: Seconds remaining until quota reset
- `Retry-After`: Retry delay seconds if limit is reached

### 1.3 Standard Error Format
All errors return a standardized JSON structure:
```json
{
  "success": false,
  "code": "VALIDATION_ERROR | AUTHENTICATION_ERROR | FORBIDDEN | NOT_FOUND | RATE_LIMIT_EXCEEDED | INTERNAL_SERVER_ERROR",
  "message": "Human-readable description of error",
  "details": null
}
```

---

## 2. API Groups Overview

```
├── 1. Authentication & Session Management
├── 2. Operational Reviews & Analytics
├── 3. Ingestion Pipelines & Mail Quarantine Filter
├── 4. TimePay Chatbot Feedback & Tickets
├── 5. Real-Time Push Notifications & Live Stream
└── 6. System Administration, RBAC & Compliance
```

---

## Group 1: Authentication & Session Management

### `POST /api/auth/login`
Authenticates user credentials and issues a signed JWT token.

- **Rate Limit:** 10 requests / min
- **Public Endpoint**
- **Request Body:**
  ```json
  {
    "email": "analyst@company.com",
    "password": "UserStrongPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "analyst@company.com",
      "name": "Jane Analyst",
      "role": "ANALYST",
      "permissions": [
        "reviews:read",
        "reviews:export",
        "settings:read"
      ]
    }
  }
  ```

---

### `POST /api/auth/invite/accept`
Validates an invitation token and provisions a new collaborator account.

- **Rate Limit:** 10 requests / min
- **Public Endpoint**
- **Request Body:**
  ```json
  {
    "token": "a1b2c3d4e5f6...",
    "name": "Alex Taylor",
    "password": "NewSecurePassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "email": "alex.taylor@company.com",
      "name": "Alex Taylor",
      "role": "VIEWER",
      "permissions": ["reviews:read"]
    }
  }
  ```

---

### `GET /api/auth/me`
Retrieves identity and permissions for the currently authenticated caller.

- **Required Permission:** Authenticated session
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "email": "admin@company.com",
      "name": "System Administrator",
      "role": "ADMIN",
      "status": "ACTIVE",
      "permissions": [
        "reviews:read",
        "reviews:write",
        "reviews:export",
        "settings:read",
        "settings:write",
        "users:read",
        "users:invite",
        "users:manage_rbac",
        "audit:read",
        "pipeline:trigger"
      ]
    }
  }
  ```

---

## Group 2: Operational Reviews & Analytics

### `GET /api/reviews`
Queries paginated reviews with multi-channel filtering, date ranges, and search.

- **Required Permission:** `reviews:read`
- **Query Parameters:**
  - `page` (int, default: `1`, min: `1`)
  - `limit` (int, default: `20`, min: `1`, max: `100`)
  - `channel` (string, optional: `Email-SFTP` | `Google Playstore` | `Chatbot`)
  - `starRating` (int, optional: `1` to `5`)
  - `category` (string, optional)
  - `search` (string, optional: matches text, TPR ID, subcategory)
  - `startDate` (ISO 8601 string, optional)
  - `endDate` (ISO 8601 string, optional)
  - `sortBy` (string, optional: `review_timestamp` | `star_ratings` | `created_at` | `unique_id`)
  - `sortOrder` (string, optional: `ASC` | `DESC`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "reviews": [
      {
        "unique_id": "TPR0001",
        "channel": "Email-SFTP",
        "star_ratings": 1,
        "review_text": "Unable to receive login OTP on registered mobile number.",
        "category": "Account & Auth",
        "subcategory": "OTP Delay",
        "priority": "Urgent",
        "status": "New",
        "resolution": "Investigate SMS gateway status.",
        "department": "Customer Support",
        "review_timestamp": "2026-11-01T10:00:00.000Z",
        "created_at": "2026-11-01T10:00:05.120Z"
      }
    ],
    "total": 1420,
    "page": 1,
    "limit": 20,
    "totalPages": 71
  }
  ```

---

### `GET /api/reviews/stats`
Calculates KPI metrics across all review channels.

- **Required Permission:** `reviews:read`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "totalReviews": 1420,
      "averageRating": 3.84,
      "past24hVolume": 38,
      "ratingsDistribution": { "1": 120, "2": 95, "3": 210, "4": 415, "5": 580 },
      "channels": { "Email-SFTP": 350, "Google Playstore": 890, "Chatbot": 180 },
      "categories": [
        { "category": "Billing & Payment", "count": 420 },
        { "category": "Stability & Crash", "count": 210 }
      ]
    }
  }
  ```

---

### `GET /api/reviews/export`
Exports up to 5,000 recent reviews in JSON or CSV format. Includes automatic CSV formula injection sanitization (CWE-1236 mitigation).

- **Required Permission:** `reviews:export`
- **Query Parameters:**
  - `format` (string, default: `json`, options: `json` | `csv`)
- **Response Headers:**
  - `Content-Disposition: attachment; filename="reviews-export.csv"`
  - `Content-Type: text/csv` (or `application/json`)

---

### `PUT /api/reviews/:uniqueId`
Updates operational review triage fields (status, resolution notes, priority, department).

- **Required Permission:** `reviews:write`
- **Path Parameters:**
  - `uniqueId`: String identifier (e.g., `TPR0001`)
- **Request Body:**
  ```json
  {
    "status": "In Progress",
    "priority": "High",
    "department": "Engineering",
    "resolution": "Assigned to ticket ENG-4921 for database deadlocks."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "review": {
      "unique_id": "TPR0001",
      "status": "In Progress",
      "priority": "High",
      "department": "Engineering"
    }
  }
  ```

---

## Group 3: Ingestion Pipelines & Mail Quarantine Filter

### `GET /api/ingestion/email/status`
Returns live state of the email watcher, queue length, and triage stats.

- **Required Permission:** Authenticated
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "isProcessing": false,
      "pendingCount": 0,
      "processedCount": 85,
      "supportCount": 79,
      "nonSupportCount": 6,
      "failedCount": 0,
      "lastRunAt": "2026-11-02T06:45:00.000Z",
      "lastError": null
    }
  }
  ```

---

### `POST /api/ingestion/email/trigger`
Forces an immediate batch processing run of all pending JSON email files.

- **Required Permission:** `pipeline:trigger`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "result": {
      "processed": 4,
      "failed": 0,
      "inProgress": false
    }
  }
  ```

---

### `GET /api/ingestion/email/filtered`
Inspects quarantined non-support emails and false positives.

- **Required Permission:** `reviews:read`
- **Query Parameters:**
  - `page` (int, default: `1`)
  - `limit` (int, default: `20`, max: `100`)
  - `supportFlag` (string, optional: `not_support`)
  - `search` (string, optional: search sender, subject, or reason)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "items": [
      {
        "id": 1,
        "message_id": "<20261102.1000@enterprise.com>",
        "from_address": "colleague@enterprise.com",
        "subject": "Automatic reply: Out of Office",
        "received_date_time": "2026-11-02T05:30:00.000Z",
        "support_flag": "not_support",
        "rejection_reason": "Out-of-office / automated auto-responder",
        "file_name": "email_payload_491.json",
        "body_snippet": "I am currently out of the office on annual leave...",
        "created_at": "2026-11-02T05:31:02.000Z"
      }
    ],
    "total": 18,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
  ```

---

### `GET /api/ingestion/email/filtered/stats`
Returns aggregated quarantine statistics grouped by rejection reason / flag.

- **Required Permission:** `reviews:read`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "total": 18,
      "byFlag": {
        "not_support": 18
      }
    }
  }
  ```

---

### `GET /api/ingestion/playstore/status`
Returns Google Play scraping state and checkpoints.

- **Required Permission:** Authenticated
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "isScraping": false,
      "lastRunAt": "2026-11-02T00:00:00.000Z",
      "totalScraped": 4120,
      "lastError": null
    }
  }
  ```

---

### `POST /api/ingestion/playstore/trigger`
Forces an immediate Google Play scraper cycle.

- **Required Permission:** `pipeline:trigger`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "result": {
      "scrapedCount": 24,
      "checkpoint": "2026-11-02T06:00:00.000Z"
    }
  }
  ```

---

## Group 4: TimePay Chatbot Feedback & Tickets

### `GET /api/chatbot/tickets`
Lists synchronized customer chat dispute sessions.

- **Required Permission:** `reviews:read`
- **Query Parameters:**
  - `page` (int, default: `1`)
  - `limit` (int, default: `20`, max: `100`)
  - `txnType` (string, optional: `BBPS` | `P2M` | `P2P`)
  - `status` (int, optional: `0` = Open, `1` = Closed, `2` = In Progress)
  - `categoryName` (string, optional)
  - `search` (string, optional: complaint ID, customer mobile, txn ID)
  - `fromDate` (ISO date, optional)
  - `toDate` (ISO date, optional)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "sessions": [
      {
        "id": "cb_sess_9021",
        "complaint_id": "CMP2026110298",
        "category_name": "Failed Payment Dispute",
        "ticket_category": "BBPS",
        "status": 0,
        "payer_name": "R*** K***",
        "amount": 450.00,
        "txn_status": "Failure",
        "created_at": "2026-11-02T04:12:00.000Z",
        "review_unique_id": "TPR0012"
      }
    ],
    "total": 310,
    "page": 1,
    "limit": 20,
    "totalPages": 16
  }
  ```

---

### `GET /api/chatbot/tickets/:id`
Retrieves full conversational transcripts and transaction logs for a single ticket.

- **Required Permission:** `reviews:read`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "ticket": {
      "id": "cb_sess_9021",
      "complaint_id": "CMP2026110298",
      "chat_details": [
        { "botUser": "BOT", "message": "Select transaction issue" },
        { "botUser": "USER", "message": "Money deducted but electricity bill unpaid" }
      ],
      "txn_details": {
        "amount": 450.00,
        "rrn": "439201948291",
        "txnStatus": "Failure"
      }
    }
  }
  ```

---

### `POST /api/chatbot/poll`
Triggers an on-demand poll of the external TimePay Chatbot API.

- **Required Permission:** `pipeline:trigger`
- **Request Body:** Optional filters (`page`, `size`, `txnType`, `fromDate`, `toDate`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "result": {
      "newCount": 12,
      "inProgress": false
    }
  }
  ```

---

## Group 5: Real-Time Push Notifications & Live Stream

### `GET /api/notifications/stream`
Server-Sent Events (SSE) live push stream for critical feedback events and triage notifications.

- **Authentication:** `Bearer <token>` in header OR `?token=<jwt_token>` in query parameter.
- **Response Stream Header:**
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
- **Payload Event Structure:**
  ```
  data: {"id":"1730530000","title":"Critical Feedback [TPR0015]","body":"1 Stars: Billing & Payment - Customer charged twice","url":"/dashboard#TPR0015","priority":"Urgent","timestamp":"2026-11-02T06:50:00.000Z"}
  ```

---

### `POST /api/notifications/subscribe`
Registers a Web Push notification subscription.

- **Required Permission:** Authenticated
- **Request Body:**
  ```json
  {
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "auth": "auth_key_here",
        "p256dh": "p256dh_key_here"
      }
    },
    "deviceLabel": "Desktop Chrome"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Notification subscription registered"
  }
  ```

---

### `POST /api/notifications/test`
Broadcasts a test notification alert to all active SSE subscribers.

- **Required Role:** `ADMIN` or `MANAGER`
- **Request Body:**
  ```json
  {
    "title": "System Alert",
    "body": "Test alert notification broadcast.",
    "priority": "Normal"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Test notification broadcasted"
  }
  ```

---

## Group 6: System Administration, RBAC & Compliance

### `GET /api/admin/users`
Lists platform users with RBAC roles and activity.

- **Required Permission:** `users:read`
- **Query Parameters:** `page`, `limit` (max 100)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": 1,
        "email": "admin@company.com",
        "name": "System Administrator",
        "role": "ADMIN",
        "status": "ACTIVE",
        "last_login_at": "2026-11-02T06:30:00.000Z"
      }
    ],
    "total": 4
  }
  ```

---

### `PUT /api/admin/users/:id/role`
Modifies a user's role (`ADMIN`, `MANAGER`, `ANALYST`, `VIEWER`).

- **Required Role:** `ADMIN`
- **Request Body:**
  ```json
  { "role": "MANAGER" }
  ```
- **Response (200 OK):**
  ```json
  { "success": true, "user": { "id": 2, "role": "MANAGER" } }
  ```

---

### `PUT /api/admin/users/:id/status`
Suspends or reactivates a user account.

- **Required Role:** `ADMIN`
- **Request Body:**
  ```json
  { "status": "SUSPENDED" }
  ```
- **Response (200 OK):**
  ```json
  { "success": true, "user": { "id": 2, "status": "SUSPENDED" } }
  ```

---

### `POST /api/admin/invites`
Generates a cryptographically secure token invite for new members.

- **Required Permission:** `users:invite`
- **Request Body:**
  ```json
  {
    "email": "new.member@company.com",
    "role": "ANALYST",
    "expiresInHours": 48
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "invite": {
      "id": 5,
      "email": "new.member@company.com",
      "role": "ANALYST",
      "token": "7f8b9a1c...",
      "inviteUrl": "http://localhost:3000/accept-invite?token=7f8b9a1c..."
    }
  }
  ```

---

### `GET /api/admin/settings/ai`
Fetches AI classification settings. API keys are masked (`***`) for security.

- **Required Permission:** `settings:read`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "aiConfig": {
      "enabled": true,
      "provider": "openrouter",
      "model": "meta-llama/llama-3.3-70b-instruct",
      "apiKey": "***",
      "baseUrl": "https://openrouter.ai/api/v1",
      "categories": ["Billing & Payment", "Stability & Crash", "Bug Report", "Feature Request", "Account & Auth", "Performance", "General Support"],
      "subcategories": { ... }
    }
  }
  ```

---

### `PUT /api/admin/settings/ai`
Updates AI model configuration and category definitions.

- **Required Role:** `ADMIN`
- **Request Body:**
  ```json
  {
    "enabled": true,
    "model": "meta-llama/llama-3.3-70b-instruct",
    "apiKey": "***" // Sending '***' leaves existing secret intact
  }
  ```

---

### `POST /api/admin/vault/test`
Validates connectivity to HashiCorp Vault. Includes SSRF prevention (blocks loopback, cloud metadata `169.254.169.254`, and directory traversal).

- **Required Role:** `ADMIN`
- **Request Body:**
  ```json
  {
    "address": "http://127.0.0.1:8200",
    "token": "hvs.exampleToken...",
    "path": "secret/data/automation"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Successfully connected to HashiCorp Vault",
    "keysFound": ["ai_api_key", "db_password"]
  }
  ```

---

### `GET /api/admin/audit-logs`
Provides compliance audit trail for sensitive administrative operations.

- **Required Permission:** `audit:read`
- **Query Parameters:** `page`, `limit` (max 100), `action`, `resource`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "logs": [
      {
        "id": 104,
        "user_email": "admin@company.com",
        "action": "USER_ROLE_CHANGED",
        "resource": "user:2",
        "details": "{\"newRole\":\"MANAGER\"}",
        "ip_address": "127.0.0.1",
        "created_at": "2026-11-02T06:40:00.000Z"
      }
    ],
    "total": 104
  }
  ```
