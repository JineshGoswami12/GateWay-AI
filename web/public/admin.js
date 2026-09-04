// =============================================================================
// Admin Portal Controller (GateWay-AI /admin)
// =============================================================================

const adminAuthView = document.getElementById('admin-auth-view');
const adminDashboardView = document.getElementById('admin-dashboard-view');
const adminSessionControls = document.getElementById('admin-session-controls');
const adminLoginForm = document.getElementById('admin-login-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminErrorBanner = document.getElementById('admin-error-banner');

const btnAdminRefresh = document.getElementById('btn-admin-refresh');
const btnAdminClear = document.getElementById('btn-admin-clear');
const btnAdminSignout = document.getElementById('btn-admin-signout');

// Metric elements
const metricTotalVal = document.getElementById('metric-total-val');
const metricBlockRate = document.getElementById('metric-block-rate');
const metricTotalDiag = document.getElementById('metric-total-diag');
const metricTotalRules = document.getElementById('metric-total-rules');
const metricRulesSub = document.getElementById('metric-rules-sub');

// Table body elements
const valTableBody = document.getElementById('table-validations-body');
const diagTableBody = document.getElementById('table-diagnoses-body');
const whTableBody = document.getElementById('table-webhooks-body');
const rulesTableBody = document.getElementById('table-rules-body');

// Sub-tab switcher
const subTabBtns = document.querySelectorAll('.sub-tab-btn');
const subtabViews = document.querySelectorAll('.subtab-view');

subTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.subtab;
    subTabBtns.forEach(b => b.classList.remove('active'));
    subtabViews.forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const view = document.getElementById(`subtab-${target}`);
    if (view) view.classList.add('active');
  });
});

// Authentication state
function getAuthToken() {
  return sessionStorage.getItem('gateway_admin_token');
}

function setAuthToken(token) {
  if (token) {
    sessionStorage.setItem('gateway_admin_token', token);
  } else {
    sessionStorage.removeItem('gateway_admin_token');
  }
}

// Check initial session
function checkAuth() {
  const token = getAuthToken();
  if (token) {
    showDashboard();
    loadAdminData();
  } else {
    showLogin();
  }
}

function showLogin(errorMessage = '') {
  adminAuthView.classList.remove('hidden');
  adminDashboardView.classList.add('hidden');
  adminSessionControls.classList.add('hidden');
  if (errorMessage) {
    adminErrorBanner.textContent = errorMessage;
    adminErrorBanner.classList.remove('hidden');
  } else {
    adminErrorBanner.classList.add('hidden');
  }
  adminPasswordInput.value = '';
  adminPasswordInput.focus();
}

function showDashboard() {
  adminAuthView.classList.add('hidden');
  adminDashboardView.classList.remove('hidden');
  adminSessionControls.classList.remove('hidden');
  adminErrorBanner.classList.add('hidden');
}

// Login form handler
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = adminPasswordInput.value.trim();
  if (!password) return;

  adminErrorBanner.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      setAuthToken(data.token);
      showDashboard();
      loadAdminData();
    } else {
      showLogin(data.error || 'Authentication failed. Please check the administrator password.');
    }
  } catch (err) {
    showLogin(`Network error: ${err.message}`);
  }
});

// Sign out handler
btnAdminSignout.addEventListener('click', () => {
  setAuthToken(null);
  showLogin();
});

// Refresh handler
btnAdminRefresh.addEventListener('click', () => {
  loadAdminData();
});

// Clear history handler (destructive action with explicit type-to-confirm)
btnAdminClear.addEventListener('click', async () => {
  const confirmation = prompt(
    'DESTRUCTIVE ACTION:\nThis will permanently delete all activity telemetry from the SQLite database.\n\nTo confirm, type "CLEAR" below:'
  );

  if (confirmation !== 'CLEAR') {
    if (confirmation !== null) {
      alert('Clear action cancelled. You must type "CLEAR" exactly to confirm.');
    }
    return;
  }

  const token = getAuthToken();
  if (!token) return showLogin('Session expired.');

  try {
    const res = await fetch('/api/admin/clear', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      loadAdminData();
    } else {
      alert(data.error || 'Failed to clear history');
    }
  } catch (err) {
    alert(`Error clearing history: ${err.message}`);
  }
});

// Load admin data (metrics + all 4 tables)
async function loadAdminData() {
  const token = getAuthToken();
  if (!token) {
    return showLogin('Session expired. Please sign in again.');
  }

  try {
    const res = await fetch('/api/admin/data?limit=50', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401 || res.status === 403) {
      setAuthToken(null);
      return showLogin('Invalid or expired admin token. Please sign in again.');
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to retrieve admin data');
    }

    // 1. Render Metrics
    if (data.metrics) {
      metricTotalVal.textContent = data.metrics.totalValidations;
      metricBlockRate.textContent = `${data.metrics.blockRatePercent}%`;
      metricTotalDiag.textContent = data.metrics.totalDiagnoses;
      if (metricTotalRules && data.metrics.totalRules !== undefined) {
        metricTotalRules.textContent = data.metrics.totalRules;
        if (metricRulesSub) {
          metricRulesSub.textContent = `${data.metrics.builtInRules || 7} built-in • ${data.metrics.aiLearnedRules || 0} learned`;
        }
      }
    }

    const { validations = [], diagnoses = [], webhooks = [], rules = [] } = data.history || {};

    // 2. Render Validations Table
    if (validations.length === 0) {
      valTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No validation records logged yet.</td></tr>`;
    } else {
      valTableBody.innerHTML = validations.map(v => {
        const passedBadge = v.passed === 1
          ? `<span class="status-badge-inline badge-pass">Passed</span>`
          : `<span class="status-badge-inline badge-blocked">Blocked</span>`;
        const originBadge = v.rule_origin === 'ai_proposed'
          ? `<span class="origin-badge origin-ai">AI-Learned</span>`
          : (v.rule_id ? `<span class="origin-badge origin-builtin">Built-in</span>` : `<span class="text-muted">—</span>`);
        const payloadSnippet = v.payload_json ? escapeHtml(v.payload_json.slice(0, 48) + (v.payload_json.length > 48 ? '...' : '')) : '-';
        return `
          <tr>
            <td>${formatDate(v.timestamp)}</td>
            <td>${escapeHtml(v.method || '-')}</td>
            <td>${passedBadge}</td>
            <td>${escapeHtml(v.rule_id || '-')}</td>
            <td>${originBadge}</td>
            <td><code>${payloadSnippet}</code></td>
            <td>${v.latency_ms ?? 0}ms</td>
          </tr>
        `;
      }).join('');
    }

    // 3. Render AI Diagnoses Table
    if (diagnoses.length === 0) {
      diagTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No AI diagnosis records logged yet.</td></tr>`;
    } else {
      diagTableBody.innerHTML = diagnoses.map(d => {
        const summary = d.root_cause || d.explanation || '-';
        const summarySnippet = escapeHtml(summary.slice(0, 56) + (summary.length > 56 ? '...' : ''));
        return `
          <tr>
            <td>${formatDate(d.timestamp)}</td>
            <td><span class="text-error fw-600">${escapeHtml(d.error_code || 'ERROR')}</span></td>
            <td>${escapeHtml(d.method || '-')}</td>
            <td><span class="latency-badge">${escapeHtml(d.model_source || 'Gemini')}</span></td>
            <td>${summarySnippet}</td>
            <td>${d.latency_ms ?? 0}ms</td>
          </tr>
        `;
      }).join('');
    }

    // 4. Render Webhooks Table
    if (webhooks.length === 0) {
      whTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No webhook deliveries logged yet.</td></tr>`;
    } else {
      whTableBody.innerHTML = webhooks.map(w => {
        const sigBadge = w.signature_verified === 1
          ? `<span class="status-badge-inline badge-pass">Verified</span>`
          : `<span class="status-badge-inline badge-blocked">Unverified</span>`;
        return `
          <tr>
            <td>${formatDate(w.timestamp)}</td>
            <td><code>${escapeHtml(w.id || '-')}</code></td>
            <td><span class="log-event">${escapeHtml(w.event_name || '-')}</span></td>
            <td>${sigBadge}</td>
            <td><span class="text-success">${w.status_code || 200} OK</span></td>
            <td><span class="text-muted">${escapeHtml(w.target_url || '-')}</span></td>
            <td>${w.latency_ms ?? 0}ms</td>
          </tr>
        `;
      }).join('');
    }

    // 5. Render Active Rules Table
    if (rules.length === 0) {
      rulesTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No rules active in engine.</td></tr>`;
    } else {
      rulesTableBody.innerHTML = rules.map(r => {
        const originBadge = r.origin === 'ai_proposed'
          ? `<span class="origin-badge origin-ai">AI-Learned (active)</span>`
          : `<span class="origin-badge origin-builtin">Built-in (core)</span>`;
        const conditionSnippet = r.field ? `<code>${escapeHtml(r.field)}</code> (${escapeHtml(r.condition || 'check')})` : 'core validation routine';
        return `
          <tr>
            <td><code>${escapeHtml(r.rule_id || r.id)}</code></td>
            <td>${escapeHtml(r.method || '*')}</td>
            <td>${originBadge}</td>
            <td>${conditionSnippet}</td>
            <td class="text-muted text-xs">${escapeHtml(r.description || '-')}</td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Failed to load admin data:', err);
    valTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-rose">Failed to load records. Click Refresh to retry.</td></tr>`;
    diagTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-rose">Failed to load records. Click Refresh to retry.</td></tr>`;
    whTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-rose">Failed to load records. Click Refresh to retry.</td></tr>`;
    rulesTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-rose">Failed to load records. Click Refresh to retry.</td></tr>`;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize on page load
checkAuth();
