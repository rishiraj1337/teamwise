# Frontend Integration & Developer Guide

**Platform:** Enterprise Unified Review Platform  
**Target:** Frontend Engineers, Full-Stack Developers, UI Integrators  
**Last Updated:** November 2026

---

## 1. Architectural Overview

The frontend is a responsive, lightweight single-page application (SPA) designed to interface with the backend REST and Server-Sent Event (SSE) endpoints.

---

## 2. Authentication & Session Management

### 2.1 Credential Input Security
> [!IMPORTANT]
> Admin and user credentials must never be prefilled or hardcoded in HTML markup. Inputs should provide clean placeholders and browser-standard autofill attributes:

```html
<form id="formSignIn">
  <input type="email" id="signInEmail" placeholder="name@company.com" autocomplete="username" required>
  <input type="password" id="signInPassword" placeholder="Enter your password" autocomplete="current-password" required>
  <button type="submit">Sign In</button>
</form>
```

### 2.2 Token Lifecycle & API Request Wrapper
Store the issued JWT in `localStorage` or memory, and attach it to all outbound HTTP calls:

```javascript
const state = {
  token: localStorage.getItem('token') || '',
  user: null,
};

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(endpoint, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    // Session expired or invalid - prompt re-authentication
    state.token = '';
    state.user = null;
    localStorage.removeItem('token');
    showSignInModal();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with code ${response.status}`);
  }

  return data;
}
```

### 2.3 Invitation Acceptance Flow
When new users receive an invite link (e.g., `https://domain.com/accept-invite?token=<INVITE_TOKEN>`), parse the URL search parameter and display the accept modal:

```javascript
const urlParams = new URLSearchParams(window.location.search);
const inviteToken = urlParams.get('token');
if (inviteToken) {
  showAcceptInviteModal(inviteToken);
}

// Submitting invite acceptance
async function acceptInvitation(token, name, password) {
  const res = await api('/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify({ token, name, password }),
  });
  state.token = res.token;
  state.user = res.user;
  localStorage.setItem('token', res.token);
  hideModals();
  initializeDashboard();
}
```

---

## 3. Real-Time Push Notifications & Live Stream (SSE)

### 3.1 Authenticated EventSource Connection
Browsers cannot set HTTP headers in the standard `EventSource` constructor. Pass the authorization token in the query string (`/api/notifications/stream?token=<JWT>`):

```javascript
let activeEventSource = null;

function setupNotifications() {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  if (!state.token) {
    updateBadge('Stream Offline', 'gray');
    return;
  }

  const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(state.token)}`;
  activeEventSource = new EventSource(streamUrl);

  activeEventSource.onopen = () => {
    updateBadge('Live Stream Connected', 'green');
  };

  activeEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      triggerDesktopNotification(data.title, data.body);
      
      // Auto-refresh active views
      if (state.activeView === 'dashboard') {
        loadDashboardData(false);
      }
    } catch (e) {
      // Keepalive ping
    }
  };

  activeEventSource.onerror = () => {
    updateBadge('Stream Reconnecting', 'red');
  };
}
```

---

## 4. Role-Based Access Control (RBAC) in UI

### 4.1 Permission Matrix
The backend sends user roles (`ADMIN`, `MANAGER`, `ANALYST`, `VIEWER`) and their allowed permissions array. Conditionally show or disable UI elements:

| Action / View | ADMIN | MANAGER | ANALYST | VIEWER |
|---|:---:|:---:|:---:|:---:|
| View Dashboard & Filter Reviews | Yes | Yes | Yes | Yes |
| Export CSV / JSON | Yes | Yes | Yes | No |
| Edit Review Status / Resolution | Yes | Yes | No | No |
| Trigger Ingestion Pipelines | Yes | Yes | No | No |
| Access AI & Polling Settings | Read / Write | Read Only | Read Only | No |
| User Management & Invites | Full RBAC | Read / Invite | No | No |
| Compliance & Vault Audit | Full RBAC | Read Only | No | No |

### 4.2 Frontend RBAC Enforcement Helper
```javascript
function hasPermission(permission) {
  return state.user?.permissions?.includes(permission) ?? false;
}

function enforceRbacViewRestrictions() {
  const role = state.user?.role || 'VIEWER';

  // Toggle navigation links
  document.getElementById('navRbac').style.display = ['ADMIN', 'MANAGER'].includes(role) ? 'block' : 'none';
  document.getElementById('navAi').style.display = ['ADMIN', 'MANAGER', 'ANALYST'].includes(role) ? 'block' : 'none';
  document.getElementById('navAudit').style.display = ['ADMIN', 'MANAGER'].includes(role) ? 'block' : 'none';
  
  // Disable edit controls for read-only roles
  document.getElementById('btnSaveAiConfig').disabled = (role !== 'ADMIN');
  document.getElementById('btnExportCsv').style.display = hasPermission('reviews:export') ? 'inline-block' : 'none';
}
```

---

## 5. Review Dashboard & Search Grid

### 5.1 Query Parameters & Safe Bounds
Always constrain pagination parameters within safe bounds (`limit <= 100`, `page >= 1`):

```javascript
async function fetchReviews({ page = 1, limit = 20, channel = '', starRating = '', search = '' } = {}) {
  const params = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(Math.min(100, Math.max(1, limit))),
  });

  if (channel) params.append('channel', channel);
  if (starRating) params.append('starRating', starRating);
  if (search) params.append('search', search.trim());

  return api(`/api/reviews?${params.toString()}`);
}
```

### 5.2 Review Card Rendering & Status Triage
When updating triage status, call `PUT /api/reviews/:uniqueId`:
```javascript
async function updateReviewStatus(uniqueId, status, resolution) {
  const result = await api(`/api/reviews/${encodeURIComponent(uniqueId)}`, {
    method: 'PUT',
    body: JSON.stringify({ status, resolution }),
  });
  return result.review;
}
```

---

## 6. Ingestion Pipelines & Mail Quarantine Monitoring

### 6.1 Email Ingestion Card Integration
Display the pipeline status, support emails ingested, and quarantined non-support items:

```javascript
async function refreshEmailIngestionCard() {
  const data = await api('/api/ingestion/email/status');
  const stats = data.stats;

  document.getElementById('emailStatusText').textContent = stats.isProcessing ? 'Processing' : 'Monitoring Active';
  document.getElementById('emailPendingFiles').textContent = stats.pendingCount;
  document.getElementById('emailSupportCount').textContent = stats.supportCount || 0;
  document.getElementById('emailNonSupportCount').textContent = stats.nonSupportCount || 0;
}
```

### 6.2 Manual Trigger Buttons
Provide loading states and disable trigger buttons while operations run:

```javascript
document.getElementById('btnTriggerEmailSync').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Running Ingestion...';

  try {
    const res = await api('/api/ingestion/email/trigger', { method: 'POST' });
    alert(`Batch complete: Ingested ${res.result.processed} file(s).`);
    refreshEmailIngestionCard();
    loadDashboardData();
  } catch (err) {
    alert(`Trigger failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Email Ingestion Now';
  }
});
```

---

## 7. Error Handling & Security Guidelines

1. **XSS Sanitization:** Never render unsanitized review text or customer complaint transcripts using `innerHTML`. Use `textContent` or DOM text nodes:
   ```javascript
   // Safe:
   rowElement.textContent = review.review_text;
   // Unsafe:
   // rowElement.innerHTML = review.review_text;
   ```
2. **Secret Redaction:** Form inputs for API keys (`aiApiKeyInput`, `pollChatbotApiKey`, `compVaultToken`) load masked values (`***`). When submitting updates, only send non-asterisk values to avoid accidentally clearing stored secrets.
3. **SSRF Caution:** Never permit client users to specify external arbitrary webhook URLs without backend validation against known domains.
