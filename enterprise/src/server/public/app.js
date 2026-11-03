'use strict';

// Application State
const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  activeView: 'dashboard',
  reviewsPage: 1,
  reviewsLimit: 15,
  aiCategories: [],
  aiSubcategories: {},
  cbPage: 1,
  cbLimit: 20,
  selectedTicketId: null,
  cbCategoriesLoaded: false,
};

// API Helper
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    showSignInModal();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupNotifications();
  setupEventListeners();

  // Check URL params for invite token
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('token');
  if (inviteToken) {
    showAcceptInviteModal(inviteToken);
    return;
  }

  if (state.token) {
    try {
      await loadCurrentUser();
      await initializeViews();
    } catch (e) {
      showSignInModal();
    }
  } else {
    showSignInModal();
  }
});

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = link.getAttribute('data-view');
      switchView(viewId);
    });
  });
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  if (activeLink) activeLink.classList.add('active');

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) targetSection.classList.add('active');

  // Trigger view refresh
  if (viewId === 'dashboard') loadDashboardData();
  else if (viewId === 'pipelines') loadPipelinesData();
  else if (viewId === 'chatbot') loadChatbotData();
  else if (viewId === 'admin-rbac') loadUsersAndInvites();
  else if (viewId === 'admin-ai') loadAiSettings();
  else if (viewId === 'admin-polling') loadPollingSettings();
  else if (viewId === 'admin-compliance') loadComplianceSettings();
  else if (viewId === 'audit') loadAuditLogs();
}

// User & Auth Management
async function loadCurrentUser() {
  const data = await api('/api/auth/me');
  state.user = data.user;
  renderUserBadge();
  enforceRbacViewRestrictions();
}

function renderUserBadge() {
  if (!state.user) return;
  document.getElementById('userEmailSpan').textContent = state.user.email;
  const pill = document.getElementById('userRolePill');
  pill.textContent = state.user.role;
  pill.className = `role-pill ${state.user.role}`;
}

function enforceRbacViewRestrictions() {
  const role = state.user?.role || 'VIEWER';
  const isAdmin = role === 'ADMIN';
  const isManager = role === 'MANAGER' || isAdmin;

  // Toggle admin/manager links
  document.getElementById('navRbac').style.display = isManager ? 'flex' : 'none';
  document.getElementById('navAi').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('navPolling').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('navCompliance').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('navAudit').style.display = isManager ? 'flex' : 'none';
}

function showSignInModal() {
  document.getElementById('modalSignIn').classList.add('active');
}

function hideSignInModal() {
  document.getElementById('modalSignIn').classList.remove('active');
}

function showAcceptInviteModal(token) {
  window.currentInviteToken = token;
  document.getElementById('modalAcceptInvite').classList.add('active');
}

// Desktop Push Notifications & SSE Live Stream
let activeEventSource = null;

function setupNotifications() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  const liveBadge = document.getElementById('liveStreamBadge');
  if (!state.token) {
    if (liveBadge) {
      liveBadge.style.backgroundColor = 'rgba(156, 163, 175, 0.2)';
      liveBadge.style.color = '#9ca3af';
      liveBadge.textContent = 'Stream Offline';
    }
    return;
  }

  // Connect SSE for Real-Time Live Desktop Notifications with authenticated token
  const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(state.token)}`;
  activeEventSource = new EventSource(streamUrl);

  activeEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      triggerDesktopNotification(data.title, data.body);
      // Auto-refresh dashboard if active
      if (state.activeView === 'dashboard') {
        loadDashboardData(false);
      }
    } catch (e) {
      // Ping frame or comment
    }
  };

  activeEventSource.onerror = () => {
    if (liveBadge) {
      liveBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
      liveBadge.style.color = '#f87171';
      liveBadge.textContent = 'Stream Reconnecting';
    }
  };

  activeEventSource.onopen = () => {
    if (liveBadge) {
      liveBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      liveBadge.style.color = '#34d399';
      liveBadge.textContent = 'Live Stream Connected';
    }
  };
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support desktop notifications.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    new Notification('Enterprise Review Platform', {
      body: 'Desktop notifications successfully enabled.',
    });
    document.getElementById('btnNotificationPrompt').textContent = 'Desktop Alerts Active';
    document.getElementById('btnNotificationPrompt').disabled = true;
  }
}

function triggerDesktopNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
    });
  }
}

// View Initializers
async function initializeViews() {
  hideSignInModal();
  await loadDashboardData();
}

// Dashboard Data
async function loadDashboardData(showLoading = true) {
  const tbody = document.getElementById('reviewsTableBody');
  if (showLoading) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">Loading review data...</td></tr>';
  }

  try {
    const statsData = await api('/api/reviews/stats');
    const stats = statsData.stats;
    document.getElementById('metricTotalReviews').textContent = stats.total.toLocaleString();
    document.getElementById('metricAvgRating').textContent = `${stats.averageRating} / 5.0`;
    document.getElementById('metric24hVolume').textContent = stats.recent24h.toLocaleString();

    // Query Reviews
    const channel = document.getElementById('filterChannel').value;
    const rating = document.getElementById('filterRating').value;
    const search = document.getElementById('filterSearch').value;

    const params = new URLSearchParams({
      page: state.reviewsPage,
      limit: state.reviewsLimit,
      channel,
      starRating: rating,
      search,
    });

    const reviewsData = await api(`/api/reviews?${params.toString()}`);
    renderReviewsTable(reviewsData.reviews);

    document.getElementById('paginationInfo').textContent =
      `Showing Page ${reviewsData.page} of ${Math.max(1, reviewsData.totalPages)} (${reviewsData.total} total reviews)`;

    document.getElementById('btnPrevPage').disabled = reviewsData.page <= 1;
    document.getElementById('btnNextPage').disabled = reviewsData.page >= reviewsData.totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger-color);">${err.message}</td></tr>`;
  }
}

function renderReviewsTable(reviews) {
  const tbody = document.getElementById('reviewsTableBody');
  if (!reviews || reviews.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No reviews found matching criteria</td></tr>';
    return;
  }

  tbody.innerHTML = reviews.map(r => {
    const dateStr = new Date(r.review_timestamp).toLocaleString();
    const starBadge = `<span class="badge badge-stars-${r.star_ratings}">${r.star_ratings} Stars</span>`;
    const channelBadge = `<span class="badge badge-channel">${escapeHtml(r.channel)}</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(r.unique_id)}</strong></td>
        <td>${channelBadge}</td>
        <td>${starBadge}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.subcategory)}</td>
        <td style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.review_text)}">
          ${escapeHtml(r.review_text)}
        </td>
        <td><span class="badge" style="background-color: var(--bg-tertiary);">${escapeHtml(r.priority)}</span></td>
        <td>${escapeHtml(r.status)}</td>
        <td style="font-size: 0.75rem; white-space: nowrap;">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

// Pipelines Data
async function loadPipelinesData() {
  try {
    const emailData = await api('/api/ingestion/email/status');
    const emailStats = emailData.stats;
    document.getElementById('emailStatusText').textContent = emailStats.isProcessing ? 'Processing' : 'Monitoring Active';
    document.getElementById('emailPendingFiles').textContent = emailStats.pendingCount;
    if (document.getElementById('emailSupportCount')) {
      document.getElementById('emailSupportCount').textContent = emailStats.supportCount || 0;
    }
    if (document.getElementById('emailNonSupportCount')) {
      document.getElementById('emailNonSupportCount').textContent = emailStats.nonSupportCount || 0;
    }

    const playData = await api('/api/ingestion/playstore/status');
    const playStats = playData.stats;
    document.getElementById('playstoreStatusText').textContent = playStats.isCollecting ? 'Sync In Progress' : 'Idle';
    document.getElementById('playstoreLastSynced').textContent = playStats.lastSyncAt ? new Date(playStats.lastSyncAt).toLocaleTimeString() : 'Never';
    document.getElementById('playstoreTotalCount').textContent = playStats.totalSynced;

    const chatData = await api('/api/ingestion/chatbot/status');
    const chatStats = chatData.stats;
    document.getElementById('chatbotStatusText').textContent = chatStats.isPolling ? 'Polling In Progress' : 'Idle';
    document.getElementById('chatbotLastPolled').textContent = chatStats.lastPollAt ? new Date(chatStats.lastPollAt).toLocaleTimeString() : 'Never';
    document.getElementById('chatbotTotalCount').textContent = chatStats.totalPolled;

    // Refresh intervals from settings
    const pollConfigData = await api('/api/admin/settings/polling');
    const p = pollConfigData.pollingConfig;
    if (p) {
      document.getElementById('playstoreIntervalLabel').textContent = `${p.playstoreIntervalMinutes} minute(s)`;
      document.getElementById('chatbotIntervalLabel').textContent = `${p.chatbotIntervalMinutes} minute(s)`;
    }
  } catch (err) {
    console.error('Pipelines error:', err);
  }
}

// Users & RBAC — accounts live in Teamwise (teamwisedb)
async function loadUsersAndInvites() {
  const tbody = document.getElementById('usersTableBody');
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">User accounts are managed in Teamwise (teamwisedb). Use Teamwise → Platform settings → Users.</td></tr>';
  }
  const inviteTbody = document.getElementById('invitesTableBody');
  if (inviteTbody) {
    inviteTbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:1.5rem;">Invitations are not used on the enterprise API.</td></tr>';
  }
}

// AI Settings & Enums
async function loadAiSettings() {
  try {
    const data = await api('/api/admin/settings/ai');
    const cfg = data.aiConfig;
    document.getElementById('aiEnabledSelect').value = String(cfg.enabled);
    document.getElementById('aiProviderSelect').value = cfg.provider;
    document.getElementById('aiModelInput').value = cfg.model;
    document.getElementById('aiApiKeyInput').value = cfg.apiKey ? '***' : '';

    if (document.getElementById('aiSourceEmailSelect')) {
      document.getElementById('aiSourceEmailSelect').value = String(cfg.sourceEmailEnabled !== false);
    }
    if (document.getElementById('aiSourcePlaystoreSelect')) {
      document.getElementById('aiSourcePlaystoreSelect').value = String(Boolean(cfg.sourcePlaystoreEnabled));
    }
    if (document.getElementById('aiSourceChatbotSelect')) {
      document.getElementById('aiSourceChatbotSelect').value = String(Boolean(cfg.sourceChatbotEnabled));
    }

    state.aiCategories = Array.isArray(cfg.categories) ? cfg.categories : [];
    state.aiSubcategories = cfg.subcategories || {};

    renderCategoryTags();
    document.getElementById('subcategoriesJsonTextarea').value = JSON.stringify(state.aiSubcategories, null, 2);
  } catch (err) {
    console.error('AI settings error:', err);
  }
}

function renderCategoryTags() {
  const container = document.getElementById('categoryTagsContainer');
  container.innerHTML = state.aiCategories.map((cat, idx) => `
    <span class="tag-item">
      ${escapeHtml(cat)}
      <span class="tag-remove" data-idx="${idx}">&times;</span>
    </span>
  `).join('');

  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      state.aiCategories.splice(idx, 1);
      renderCategoryTags();
    });
  });
}

// DB & Polling Settings
async function loadPollingSettings() {
  try {
    const data = await api('/api/admin/settings/polling');
    const p = data.pollingConfig;
    document.getElementById('pollEmailEnabled').value = String(p.emailEnabled);
    document.getElementById('pollEmailInterval').value = p.emailIntervalMinutes;

    document.getElementById('pollPlaystoreEnabled').value = String(p.playstoreEnabled);
    document.getElementById('pollPlaystoreIntervalMinutes').value = p.playstoreIntervalMinutes;
    document.getElementById('pollPlaystoreScrapeOnStart').value = String(p.playstoreScrapeOnStart);
    document.getElementById('pollPlaystorePackage').value = p.playstorePackage;
    document.getElementById('pollPlaystoreCountry').value = p.playstoreCountry;

    document.getElementById('pollChatbotEnabled').value = String(p.chatbotEnabled);
    document.getElementById('pollChatbotIntervalMinutes').value = p.chatbotIntervalMinutes;
    document.getElementById('pollChatbotApiUrl').value = p.chatbotApiUrl;
    document.getElementById('pollChatbotApiKey').value = p.chatbotApiKey ? '***' : '';
    document.getElementById('pollChatbotPollOnStart').value = String(p.chatbotPollOnStart);
  } catch (err) {
    console.error('Polling settings error:', err);
  }
}

// Compliance Settings
async function loadComplianceSettings() {
  try {
    const data = await api('/api/admin/settings/compliance');
    const c = data.compliance;
    document.getElementById('compPiiMasking').value = String(c.piiMasking);
    document.getElementById('compRetentionDays').value = c.retentionDays;
    document.getElementById('compVaultEnabled').value = String(c.vaultEnabled);
    document.getElementById('compVaultAddress').value = c.vaultAddress;
    document.getElementById('compVaultPath').value = c.vaultPath;
    document.getElementById('compKeycloakEnabled').value = String(c.keycloakEnabled);
    document.getElementById('compKeycloakRealm').value = c.keycloakRealmUrl || '';
  } catch (err) {
    console.error('Compliance settings error:', err);
  }
}

// Audit Logs
async function loadAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '<tr><td colspan="7">Loading audit trail...</td></tr>';
  try {
    const actionFilter = document.getElementById('filterAuditAction')?.value?.trim();
    const resourceFilter = document.getElementById('filterAuditResource')?.value?.trim();
    const params = new URLSearchParams();
    if (actionFilter) params.append('action', actionFilter);
    if (resourceFilter) params.append('resource', resourceFilter);

    const data = await api(`/api/admin/audit-logs?${params.toString()}`);
    if (!data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No audit logs match criteria</td></tr>';
      return;
    }
    tbody.innerHTML = data.logs.map(l => `
      <tr>
        <td>${l.id}</td>
        <td style="font-size: 0.75rem;">${new Date(l.created_at).toLocaleString()}</td>
        <td>${escapeHtml(l.user_email)}</td>
        <td><strong>${escapeHtml(l.action)}</strong></td>
        <td><code>${escapeHtml(l.resource)}</code></td>
        <td style="font-size: 0.75rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(l.details || '')}">
          ${escapeHtml(l.details || '')}
        </td>
        <td>${escapeHtml(l.ip_address)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger-color);">${err.message}</td></tr>`;
  }
}

// Event Listeners
function setupEventListeners() {
  // Sign In Form
  document.getElementById('formSignIn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signInEmail').value;
    const password = document.getElementById('signInPassword').value;
    const errBox = document.getElementById('signInError');
    errBox.style.display = 'none';

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      hideSignInModal();
      renderUserBadge();
      enforceRbacViewRestrictions();
      setupNotifications();
      loadDashboardData();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  // Sign Out
  document.getElementById('btnLogout').addEventListener('click', () => {
    state.token = '';
    state.user = null;
    localStorage.removeItem('token');
    setupNotifications();
    showSignInModal();
  });

  // Enable Notifications Button
  document.getElementById('btnNotificationPrompt').addEventListener('click', requestNotificationPermission);

  // Filters
  document.getElementById('btnApplyFilter').addEventListener('click', () => {
    state.reviewsPage = 1;
    loadDashboardData();
  });

  document.getElementById('btnResetFilter').addEventListener('click', () => {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterChannel').value = '';
    document.getElementById('filterRating').value = '';
    state.reviewsPage = 1;
    loadDashboardData();
  });

  document.getElementById('btnPrevPage').addEventListener('click', () => {
    if (state.reviewsPage > 1) {
      state.reviewsPage--;
      loadDashboardData();
    }
  });

  document.getElementById('btnNextPage').addEventListener('click', () => {
    state.reviewsPage++;
    loadDashboardData();
  });

  // Export
  document.getElementById('btnExportJson').addEventListener('click', () => {
    window.open(`/api/reviews/export?format=json&token=${state.token}`, '_blank');
  });

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    window.open(`/api/reviews/export?format=csv&token=${state.token}`, '_blank');
  });

  // Pipelines
  document.getElementById('btnTriggerEmailSync').addEventListener('click', async () => {
    const btn = document.getElementById('btnTriggerEmailSync');
    btn.disabled = true;
    try {
      const res = await api('/api/ingestion/email/trigger', { method: 'POST' });
      alert(`Email ingestion run completed: ${res.result.processed} processed, ${res.result.failed} failed.`);
      loadPipelinesData();
    } catch (e) {
      alert(`Trigger failed: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('btnTriggerPlaystoreSync').addEventListener('click', async () => {
    const btn = document.getElementById('btnTriggerPlaystoreSync');
    btn.disabled = true;
    try {
      const res = await api('/api/ingestion/playstore/trigger', { method: 'POST' });
      alert(`Play Store sync completed: ${res.result.newReviewCount} new reviews collected.`);
      loadPipelinesData();
    } catch (e) {
      alert(`Play Store trigger failed: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('btnTriggerChatbotPoll').addEventListener('click', async () => {
    const btn = document.getElementById('btnTriggerChatbotPoll');
    btn.disabled = true;
    try {
      const res = await api('/api/ingestion/chatbot/trigger', { method: 'POST' });
      alert(`Chatbot feedback polling completed: ${res.result.newCount} new items ingested.`);
      loadPipelinesData();
      loadDashboardData();
    } catch (e) {
      alert(`Chatbot poll failed: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  // Invite Modal
  document.getElementById('btnOpenInviteModal').addEventListener('click', () => {
    document.getElementById('inviteResultLink').textContent = '';
    document.getElementById('modalInvite').classList.add('active');
  });

  document.getElementById('btnCloseInviteModal').addEventListener('click', () => {
    document.getElementById('modalInvite').classList.remove('active');
  });

  document.getElementById('formInvite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('inviteRole').value;
    try {
      const res = await api('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      document.getElementById('inviteResultLink').innerHTML =
        `Invitation Link Generated:<br><code>${res.invite.inviteUrl}</code>`;
      loadUsersAndInvites();
    } catch (err) {
      alert(`Invitation creation failed: ${err.message}`);
    }
  });

  // Accept Invite Form
  document.getElementById('formAcceptInvite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('acceptName').value;
    const password = document.getElementById('acceptPassword').value;
    const errBox = document.getElementById('acceptError');
    errBox.style.display = 'none';

    try {
      const res = await api('/api/auth/invite/accept', {
        method: 'POST',
        body: JSON.stringify({
          token: window.currentInviteToken,
          name,
          password,
        }),
      });

      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('token', res.token);
      document.getElementById('modalAcceptInvite').classList.remove('active');
      window.history.replaceState({}, document.title, '/');
      renderUserBadge();
      enforceRbacViewRestrictions();
      loadDashboardData();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  // Add Category Enum Tag
  document.getElementById('btnAddCategory').addEventListener('click', () => {
    const input = document.getElementById('newCategoryInput');
    const val = input.value.trim();
    if (val && !state.aiCategories.includes(val)) {
      state.aiCategories.push(val);
      input.value = '';
      renderCategoryTags();
    }
  });

  // Save AI Settings
  document.getElementById('btnSaveAiSettings').addEventListener('click', async () => {
    try {
      let subcats = {};
      try {
        subcats = JSON.parse(document.getElementById('subcategoriesJsonTextarea').value);
      } catch (jsonErr) {
        alert('Invalid JSON in Subcategories textarea');
        return;
      }

      const apiKeyVal = document.getElementById('aiApiKeyInput').value;
      const payload = {
        enabled: document.getElementById('aiEnabledSelect').value === 'true',
        provider: document.getElementById('aiProviderSelect').value,
        model: document.getElementById('aiModelInput').value,
        categories: state.aiCategories,
        subcategories: subcats,
        sourceEmailEnabled: document.getElementById('aiSourceEmailSelect').value === 'true',
        sourcePlaystoreEnabled: document.getElementById('aiSourcePlaystoreSelect').value === 'true',
        sourceChatbotEnabled: document.getElementById('aiSourceChatbotSelect').value === 'true',
      };

      if (apiKeyVal && apiKeyVal !== '***') {
        payload.apiKey = apiKeyVal;
      }

      await api('/api/admin/settings/ai', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      alert('AI configuration & schema enums successfully updated in database.');
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  });

  // Save Polling Settings
  document.getElementById('btnSavePollingSettings').addEventListener('click', async () => {
    try {
      const apiKeyVal = document.getElementById('pollChatbotApiKey').value;
      const payload = {
        emailEnabled: document.getElementById('pollEmailEnabled').value === 'true',
        emailIntervalMinutes: parseInt(document.getElementById('pollEmailInterval').value, 10),

        playstoreEnabled: document.getElementById('pollPlaystoreEnabled').value === 'true',
        playstoreIntervalMinutes: parseInt(document.getElementById('pollPlaystoreIntervalMinutes').value, 10),
        playstoreScrapeOnStart: document.getElementById('pollPlaystoreScrapeOnStart').value === 'true',
        playstorePackage: document.getElementById('pollPlaystorePackage').value,
        playstoreCountry: document.getElementById('pollPlaystoreCountry').value,

        chatbotEnabled: document.getElementById('pollChatbotEnabled').value === 'true',
        chatbotIntervalMinutes: parseInt(document.getElementById('pollChatbotIntervalMinutes').value, 10),
        chatbotApiUrl: document.getElementById('pollChatbotApiUrl').value,
        chatbotPollOnStart: document.getElementById('pollChatbotPollOnStart').value === 'true',
      };

      if (apiKeyVal && apiKeyVal !== '***') {
        payload.chatbotApiKey = apiKeyVal;
      }

      await api('/api/admin/settings/polling', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      alert('Polling & Database configuration saved to database.');
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  });

  // Save Compliance Settings
  document.getElementById('btnSaveComplianceSettings').addEventListener('click', async () => {
    try {
      const payload = {
        piiMasking: document.getElementById('compPiiMasking').value === 'true',
        retentionDays: parseInt(document.getElementById('compRetentionDays').value, 10),
        vaultEnabled: document.getElementById('compVaultEnabled').value === 'true',
        vaultAddress: document.getElementById('compVaultAddress').value,
        vaultPath: document.getElementById('compVaultPath').value,
        keycloakEnabled: document.getElementById('compKeycloakEnabled').value === 'true',
        keycloakRealmUrl: document.getElementById('compKeycloakRealm').value,
      };

      await api('/api/admin/settings/compliance', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      alert('Security & Compliance settings saved to database.');
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  });

  // Test Vault
  document.getElementById('btnTestVault').addEventListener('click', async () => {
    const statusSpan = document.getElementById('vaultTestStatus');
    statusSpan.textContent = 'Testing connection...';
    try {
      const res = await api('/api/admin/vault/test', {
        method: 'POST',
        body: JSON.stringify({
          address: document.getElementById('compVaultAddress').value,
          token: document.getElementById('compVaultToken').value,
          path: document.getElementById('compVaultPath').value,
        }),
      });
      statusSpan.style.color = '#34d399';
      statusSpan.textContent = `Connected! Found keys: ${res.keysFound.join(', ')}`;
    } catch (err) {
      statusSpan.style.color = '#f87171';
      statusSpan.textContent = `Failed: ${err.message}`;
    }
  });

  // Chatbot View Listeners
  document.getElementById('btnTriggerChatbotFetch')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnTriggerChatbotFetch');
    btn.disabled = true;
    btn.textContent = 'Polling...';
    try {
      const res = await api('/api/chatbot/poll', { method: 'POST' });
      alert(`Chatbot poll finished: ${res.result.fetchedCount || 0} tickets retrieved, ${res.result.newCount || 0} new reviews mapped.`);
      loadChatbotData();
    } catch (e) {
      alert(`Chatbot poll failed: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Poll TimePay API';
    }
  });

  document.getElementById('btnRefreshChatbotList')?.addEventListener('click', loadChatbotData);

  document.getElementById('btnApplyCbFilter')?.addEventListener('click', () => {
    state.cbPage = 1;
    loadChatbotData();
  });

  document.getElementById('btnResetCbFilter')?.addEventListener('click', () => {
    document.getElementById('cbFilterSearch').value = '';
    document.getElementById('cbFilterTxnType').value = '';
    document.getElementById('cbFilterCategory').value = '';
    document.getElementById('cbFilterStatus').value = '';
    state.cbPage = 1;
    loadChatbotData();
  });

  document.getElementById('btnCbPrevPage')?.addEventListener('click', () => {
    if (state.cbPage > 1) {
      state.cbPage--;
      loadChatbotData();
    }
  });

  document.getElementById('btnCbNextPage')?.addEventListener('click', () => {
    state.cbPage++;
    loadChatbotData();
  });

  document.getElementById('btnViewInReviews')?.addEventListener('click', () => {
    if (window.activeReviewUniqueId) {
      switchView('dashboard');
      document.getElementById('filterSearch').value = window.activeReviewUniqueId;
      document.getElementById('filterChannel').value = 'Chatbot';
      loadDashboardData();
    } else {
      alert('This ticket does not have an associated Review ID yet.');
    }
  });

  // Refresh & Filter Audit
  document.getElementById('btnRefreshAudit')?.addEventListener('click', loadAuditLogs);
  document.getElementById('btnApplyAuditFilter')?.addEventListener('click', loadAuditLogs);
  document.getElementById('btnResetAuditFilter')?.addEventListener('click', () => {
    document.getElementById('filterAuditAction').value = '';
    document.getElementById('filterAuditResource').value = '';
    loadAuditLogs();
  });
}

// ================= Chatbot Tickets & Messenger Implementation =================

async function loadChatbotData() {
  // Load Categories once if not loaded
  if (!state.cbCategoriesLoaded) {
    try {
      const catRes = await api('/api/chatbot/categories');
      const select = document.getElementById('cbFilterCategory');
      if (catRes.categories && select) {
        catRes.categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.name;
          opt.textContent = cat.name;
          select.appendChild(opt);
        });
        state.cbCategoriesLoaded = true;
      }
    } catch (e) {
      console.warn('Failed to load categories for filter:', e.message);
    }
  }

  // Load summary stats
  try {
    const statsRes = await api('/api/chatbot/stats');
    const s = statsRes.stats;
    document.getElementById('cbMetricTotal').textContent = s.total.toLocaleString();
    document.getElementById('cbMetricOpen').textContent = s.statusCounts.open.toLocaleString();
    document.getElementById('cbMetricClosed').textContent = s.statusCounts.closed.toLocaleString();
    document.getElementById('cbMetricAmount').textContent = `₹${Number(s.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  } catch (e) {
    console.warn('Stats fetch error:', e.message);
  }

  // Query tickets
  const search = document.getElementById('cbFilterSearch')?.value?.trim();
  const txnType = document.getElementById('cbFilterTxnType')?.value;
  const categoryName = document.getElementById('cbFilterCategory')?.value;
  const status = document.getElementById('cbFilterStatus')?.value;

  const params = new URLSearchParams({
    page: state.cbPage,
    limit: state.cbLimit,
  });
  if (search) params.append('search', search);
  if (txnType) params.append('txnType', txnType);
  if (categoryName) params.append('categoryName', categoryName);
  if (status !== '') params.append('status', status);

  const listContainer = document.getElementById('chatbotTicketListContainer');
  listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading tickets...</div>';

  try {
    const data = await api(`/api/chatbot/tickets?${params.toString()}`);
    document.getElementById('cbTicketCountLabel').textContent = `${data.total} tickets`;
    document.getElementById('cbPaginationLabel').textContent = `Page ${data.page} of ${Math.max(1, data.totalPages)}`;

    document.getElementById('btnCbPrevPage').disabled = data.page <= 1;
    document.getElementById('btnCbNextPage').disabled = data.page >= data.totalPages;

    renderChatbotTicketList(data.items);

    // If an item was previously selected, re-select or select first item
    if (data.items.length > 0) {
      const toSelect = state.selectedTicketId && data.items.find(i => i.id === state.selectedTicketId)
        ? state.selectedTicketId
        : data.items[0].id;
      selectChatbotTicket(toSelect);
    } else {
      document.getElementById('cbEmptyState').style.display = 'flex';
      document.getElementById('cbActiveTicketContainer').style.display = 'none';
    }
  } catch (err) {
    listContainer.innerHTML = `<div style="text-align: center; color: var(--danger-color); padding: 1.5rem;">${err.message}</div>`;
  }
}

function renderChatbotTicketList(items) {
  const container = document.getElementById('chatbotTicketListContainer');
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No complaints match filter criteria</div>';
    return;
  }

  container.innerHTML = items.map(item => {
    const isActive = item.id === state.selectedTicketId ? 'active' : '';
    const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const statusLabel = item.status === 1 ? 'Closed' : item.status === 2 ? 'In-Progress' : 'Open';
    const statusClass = item.status === 1 ? 'background-color: rgba(16, 185, 129, 0.2); color: #34d399;' : item.status === 2 ? 'background-color: rgba(245, 158, 11, 0.2); color: #fbbf24;' : 'background-color: rgba(239, 68, 68, 0.2); color: #f87171;';

    return `
      <div class="ticket-item ${isActive}" data-id="${escapeHtml(item.id)}">
        <div class="ticket-item-header">
          <span class="ticket-id">${escapeHtml(item.complaint_id)}</span>
          <span class="badge" style="${statusClass}">${statusLabel}</span>
        </div>
        <div class="ticket-item-meta">
          <span style="font-weight: 600;">${escapeHtml(item.category_name)}</span>
          <span style="color: #60a5fa; font-weight: 700;">₹${Number(item.amount || 0).toFixed(2)} (${escapeHtml(item.txn_type)})</span>
        </div>
        <div class="ticket-item-concern">
          ${escapeHtml(item.payer_name)} &bull; ${escapeHtml(item.mob_no)}
        </div>
        <div class="ticket-item-footer">
          <span>${dateStr}</span>
          <span>${item.review_unique_id ? `Review: <strong>${escapeHtml(item.review_unique_id)}</strong>` : ''}</span>
        </div>
      </div>
    `;
  }).join('');

  // Attach click listeners to cards
  container.querySelectorAll('.ticket-item').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      selectChatbotTicket(id);
    });
  });
}

async function selectChatbotTicket(id) {
  state.selectedTicketId = id;

  // Highlight card
  document.querySelectorAll('.ticket-item').forEach(card => {
    if (card.getAttribute('data-id') === id) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  document.getElementById('cbEmptyState').style.display = 'none';
  const activeContainer = document.getElementById('cbActiveTicketContainer');
  activeContainer.style.display = 'flex';

  try {
    const res = await api(`/api/chatbot/tickets/${id}`);
    const t = res.ticket;
    renderChatbotTranscript(t);
  } catch (err) {
    document.getElementById('cbMessagesContainer').innerHTML = `<div style="color: var(--danger-color); padding: 1rem;">Failed to load ticket details: ${err.message}</div>`;
  }
}

function renderChatbotTranscript(ticket) {
  window.activeReviewUniqueId = ticket.review_unique_id;

  // Header
  document.getElementById('cbViewTicketId').textContent = ticket.complaint_id;
  const statusLabel = ticket.status === 1 ? 'Closed' : ticket.status === 2 ? 'In-Progress' : 'Open';
  const statusBadge = document.getElementById('cbViewStatusBadge');
  statusBadge.textContent = statusLabel;
  statusBadge.style.cssText = ticket.status === 1
    ? 'background-color: rgba(16, 185, 129, 0.2); color: #34d399;'
    : ticket.status === 2
      ? 'background-color: rgba(245, 158, 11, 0.2); color: #fbbf24;'
      : 'background-color: rgba(239, 68, 68, 0.2); color: #f87171;';

  const ratingBadge = document.getElementById('cbViewRatingBadge');
  if (ticket.rating_app) {
    ratingBadge.style.display = 'inline-block';
    ratingBadge.textContent = `${ticket.rating_app} Stars`;
    ratingBadge.className = `badge badge-stars-${ticket.rating_app}`;
  } else {
    ratingBadge.style.display = 'none';
  }

  document.getElementById('cbViewCategoryName').textContent = ticket.category_name;
  document.getElementById('cbViewTicketCat').textContent = ticket.ticket_category || ticket.txn_type;

  // Transaction details strip
  const txn = ticket.txn_details || {};
  document.getElementById('cbTxnPayerName').textContent = ticket.payer_name || 'N/A';
  document.getElementById('cbTxnMobNo').textContent = ticket.mob_no || 'N/A';
  document.getElementById('cbTxnPayerVpa').textContent = txn.payerVpa || 'N/A';
  document.getElementById('cbTxnAmountType').textContent = `₹${Number(ticket.amount || 0).toFixed(2)} (${ticket.txn_type})`;
  document.getElementById('cbTxnBenName').textContent = txn.benName || txn.payeeName || 'N/A';
  document.getElementById('cbTxnIdRrn').textContent = `${ticket.txn_id !== 'N/A' ? ticket.txn_id : ''} | RRN: ${ticket.rrn}`;
  document.getElementById('cbTxnDeviceApp').textContent = `${ticket.device_model} (v${ticket.app_version})`;
  document.getElementById('cbTxnStatusBadge').textContent = `${txn.txnStatus || 'N/A'} -> Final: ${txn.finalStatus || 'N/A'}`;

  // Messages
  const msgContainer = document.getElementById('cbMessagesContainer');
  const chatDetails = ticket.chat_details || [];

  if (!Array.isArray(chatDetails) || chatDetails.length === 0) {
    msgContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem;">No chat transcript recorded for this session</div>';
    return;
  }

  msgContainer.innerHTML = chatDetails.map(msg => {
    const isBot = msg.botUser === 'BOT';
    const rowClass = isBot ? 'chat-row-bot' : 'chat-row-user';
    const bubbleClass = isBot ? 'chat-bubble-bot' : 'chat-bubble-user';
    const senderTitle = isBot ? `TimePay Bot${msg.name ? ` (${msg.name})` : ''}` : 'Customer';
    const timeStr = msg.chatDateTime ? new Date(msg.chatDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

    return `
      <div class="chat-row ${rowClass}">
        <div class="chat-sender-tag">
          <strong>${escapeHtml(senderTitle)}</strong>
        </div>
        <div class="chat-bubble ${bubbleClass}">
          <div>${msg.message || ''}</div>
          <div class="chat-timestamp">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
