// =============================================================================
// Tab Switching Controller (Public Console: Playground & Guided Tour)
// =============================================================================
const tabButtons = document.querySelectorAll('.tab-button');
const viewPanels = document.querySelectorAll('.view-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;

    tabButtons.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    viewPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    const activePanel = document.getElementById(`tab-${targetTab}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    if (targetTab === 'guided-tour') {
      setTimeout(() => fitGuidedTerm(), 50);
    }
  });
});

// =============================================================================
// Server Status & System Check
// =============================================================================
const serverPip = document.getElementById('server-pip');
const serverStatus = document.getElementById('server-status');
const engineSource = document.getElementById('engine-source');

async function checkSystemHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    if (data.status === 'healthy') {
      serverPip.classList.add('active');
      serverStatus.textContent = 'System Ready';
      engineSource.textContent = data.geminiKeyConfigured
        ? 'AI Engine: Gemini 2.5 Flash'
        : 'AI Engine: Local Reasoning Fallback';
    }
  } catch (err) {
    serverPip.classList.remove('active');
    serverStatus.textContent = 'Offline';
  }
}
checkSystemHealth();

// =============================================================================
// Module 1: Pre-Flight Rule Checker (Open-Ended Raw JSON Editor)
// =============================================================================
const pfForm = document.getElementById('preflight-form');
const pfMethod = document.getElementById('pf-method');
const pfJsonEditor = document.getElementById('pf-json-editor');
const btnFormatJson = document.getElementById('btn-format-json');
const pfResult = document.getElementById('pf-result');
const pfLatency = document.getElementById('pf-latency');
const btnValidate = document.getElementById('btn-validate');

// Example Presets for open-ended editor
const presets = {
  decimal: {
    method: 'orders.create',
    payload: {
      amount: 499.50,
      currency: 'INR',
      receipt: 'rcpt_order_101',
      notes: { order_ref: 'cart_992' }
    }
  },
  receipt: {
    method: 'orders.create',
    payload: {
      amount: 50000,
      currency: 'INR',
      receipt: 'order_receipt_2026_super_discount_campaign_checkout_session_xyz',
      notes: { campaign: 'summer_promo' }
    }
  },
  currency: {
    method: 'orders.create',
    payload: {
      amount: 50000,
      currency: 'inr',
      receipt: 'rcpt_order_102',
      notes: { order_ref: 'cart_104' }
    }
  },
  valid: {
    method: 'orders.create',
    payload: {
      amount: 50000,
      currency: 'INR',
      receipt: 'rcpt_order_103',
      notes: { customer: 'vip' }
    }
  },
  'capture-usd': {
    method: 'payments.capture',
    payload: {
      amount: 50000,
      currency: 'USD'
    }
  }
};

// Initialize editor with valid default payload
pfJsonEditor.value = JSON.stringify(presets.valid.payload, null, 2);

// Preset insertion chips
document.querySelectorAll('.btn-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const p = presets[chip.dataset.preset];
    if (!p) return;
    if (p.method) {
      pfMethod.value = p.method;
    }
    pfJsonEditor.value = JSON.stringify(p.payload, null, 2);
    runPreflightValidation();
  });
});

// Format JSON button
btnFormatJson?.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(pfJsonEditor.value);
    pfJsonEditor.value = JSON.stringify(parsed, null, 2);
  } catch (err) {
    alert('Unable to format: payload contains invalid JSON syntax.');
  }
});

pfMethod.addEventListener('change', () => {
  if (pfMethod.value === 'payments.capture') {
    pfJsonEditor.value = JSON.stringify({ amount: 50000, currency: 'USD' }, null, 2);
  } else {
    pfJsonEditor.value = JSON.stringify(presets.valid.payload, null, 2);
  }
});

pfForm.addEventListener('submit', (e) => {
  e.preventDefault();
  runPreflightValidation();
});

async function runPreflightValidation() {
  btnValidate.disabled = true;
  pfLatency.textContent = 'Evaluating...';

  const method = pfMethod.value || 'orders.create';
  let payload = {};

  try {
    const rawText = pfJsonEditor.value.trim();
    if (!rawText) {
      throw new Error('Payload editor cannot be empty.');
    }
    payload = JSON.parse(rawText);
  } catch (err) {
    btnValidate.disabled = false;
    pfLatency.textContent = '< 1ms target';
    pfResult.innerHTML = `
      <div class="result-status-row">
        <span class="status-badge-inline badge-blocked">INVALID JSON SYNTAX</span>
        <span class="latency-badge">Editor check</span>
      </div>
      <div style="color: #f87171; font-size: 12px; margin-bottom: 4px;">
        ${escapeHtml(err.message)}
      </div>
      <div style="color: #94a3b8; font-size: 12px;">
        Please ensure the payload is valid JSON before running pre-flight verification.
      </div>
    `;
    return;
  }

  try {
    const res = await fetch('/api/playground/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, payload })
    });
    const data = await res.json();

    pfLatency.textContent = `${data.latencyMs}ms (local)`;

    if (data.passed) {
      pfResult.innerHTML = `
        <div class="result-status-row">
          <span class="status-badge-inline badge-pass">Passed Pre-Flight</span>
          <span class="latency-badge">${data.latencyMs}ms</span>
        </div>
        <div class="result-msg text-success">
          Outbound payload passed all pre-flight rules.
        </div>
        <div class="result-sub text-muted">
          Clean parameters detected. Zero network calls or gateway quota consumed.
        </div>
      `;
    } else {
      let diffHtml = '';
      if (data.fixSuggestion) {
        diffHtml = data.fixSuggestion
          .split('\n')
          .map(line => {
            if (line.trim().startsWith('-')) return `<span class="diff-del">${escapeHtml(line)}</span>`;
            if (line.trim().startsWith('+')) return `<span class="diff-add">${escapeHtml(line)}</span>`;
            return `<span class="diff-comment">${escapeHtml(line)}</span>`;
          })
          .join('\n');
      }

      const originBadge = data.ruleOrigin === 'ai_proposed'
        ? `<span class="origin-badge origin-ai">Learned via AI</span>`
        : `<span class="origin-badge origin-builtin">Built-in Rule</span>`;

      pfResult.innerHTML = `
        <div class="result-status-row">
          <div class="badge-group">
            <span class="status-badge-inline badge-blocked">Blocked Locally</span>
            ${originBadge}
          </div>
          <span class="latency-badge">Rule: ${escapeHtml(data.ruleId || 'VALIDATION_ERROR')}</span>
        </div>
        <div class="result-error-reason text-error">
          <strong>Reason:</strong> ${escapeHtml(data.description || 'Parameter check failed')}
        </div>
        ${data.violation ? `
          <div class="result-violation-detail text-muted">
            Field: <code>${escapeHtml(data.violation.field)}</code> = <span class="violation-val">${escapeHtml(JSON.stringify(data.violation.value))}</span> (Expected: <span class="expected-val">${escapeHtml(data.violation.expected)}</span>)
          </div>
        ` : ''}
        ${diffHtml ? `
          <div class="diff-title">Actionable Code Fix:</div>
          <pre class="diff-block">${diffHtml}</pre>
        ` : ''}
      `;
    }
  } catch (err) {
    pfResult.innerHTML = `<div class="text-error">Request error: ${escapeHtml(err.message)}</div>`;
  } finally {
    btnValidate.disabled = false;
  }
}

// =============================================================================
// Module 2: AI Error Translator (Gemini 2.5 Flash Free-Form Raw Error Input)
// =============================================================================
const scenarioSelect = document.getElementById('error-scenario-select');
const aiRawError = document.getElementById('ai-raw-error');
const btnDiagnose = document.getElementById('btn-diagnose');
const diagnoseSpinner = document.getElementById('diagnose-spinner');
const diagnoseBtnText = document.getElementById('diagnose-btn-text');
const aiStopwatch = document.getElementById('ai-stopwatch');
const aiLatency = document.getElementById('ai-latency');
const aiResult = document.getElementById('ai-result');

const exampleErrors = {
  currency_mismatch: JSON.stringify({
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment currency (USD) does not match the original order currency (INR)',
      field: 'currency',
      source: 'business',
      step: 'payment_capture',
      reason: 'currency_mismatch',
      metadata: {
        payment_id: 'pay_demo_101',
        order_id: 'order_demo_101',
        requested_currency: 'USD',
        order_currency: 'INR'
      }
    }
  }, null, 2),
  already_captured: JSON.stringify({
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'This payment has already been captured and cannot be captured again',
      field: null,
      source: 'business',
      step: 'payment_capture',
      reason: 'payment_already_captured',
      metadata: {
        payment_id: 'pay_demo_102',
        order_id: 'order_demo_102'
      }
    }
  }, null, 2),
  duplicate_receipt: JSON.stringify({
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'Order with this receipt ID already exists',
      field: 'receipt',
      source: 'business',
      step: 'order_creation',
      reason: 'duplicate_receipt',
      metadata: {
        receipt: 'rcpt_campaign_duplicate_001'
      }
    }
  }, null, 2)
};

// Populate raw error textarea from example selector
scenarioSelect.addEventListener('change', () => {
  const selected = scenarioSelect.value;
  if (selected && exampleErrors[selected]) {
    aiRawError.value = exampleErrors[selected];
  }
});

// Default to currency mismatch example
aiRawError.value = exampleErrors.currency_mismatch;
scenarioSelect.value = 'currency_mismatch';

btnDiagnose.addEventListener('click', async () => {
  const rawInput = aiRawError.value.trim();
  if (!rawInput) {
    alert('Please enter or paste a gateway error payload.');
    return;
  }

  btnDiagnose.disabled = true;
  diagnoseSpinner.classList.remove('hidden');
  diagnoseBtnText.textContent = 'Reasoning...';
  aiStopwatch.classList.remove('hidden');

  let elapsedSeconds = 0;
  aiStopwatch.textContent = `Elapsed: 0.0s`;
  const timer = setInterval(() => {
    elapsedSeconds += 0.1;
    aiStopwatch.textContent = `Elapsed: ${elapsedSeconds.toFixed(1)}s`;
  }, 100);

  const payload = {
    rawError: rawInput,
    scenario: scenarioSelect.value || 'custom'
  };

  try {
    const res = await fetch('/api/playground/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    clearInterval(timer);

    if (!data.success) {
      throw new Error(data.error || 'Diagnosis failed');
    }

    aiLatency.textContent = `${data.latencyMs}ms (${data.modelSource})`;

    const diag = data.diagnosis || {};
    let diffHtml = '';
    if (diag.codeFix) {
      diffHtml = diag.codeFix
        .split('\n')
        .map(line => {
          if (line.trim().startsWith('-')) return `<span class="diff-del">${escapeHtml(line)}</span>`;
          if (line.trim().startsWith('+')) return `<span class="diff-add">${escapeHtml(line)}</span>`;
          return `<span class="diff-comment">${escapeHtml(line)}</span>`;
        })
        .join('\n');
    }

    let proposalHtml = '';
    if (diag.proposedRule) {
      const pr = diag.proposedRule;
      proposalHtml = `
        <div class="rule-proposal-card" id="proposal-card-${escapeHtml(pr.id)}">
          <div class="proposal-header">
            <span class="proposal-badge">Proposed Pre-Flight Rule</span>
            <span class="proposal-pill">Self-Improving Engine</span>
          </div>
          <div class="proposal-desc">
            This failure pattern can be checked locally before network dispatch. Add this rule to the pre-flight engine to intercept matching requests immediately.
          </div>
          <div class="proposal-specs">
            <div><strong>Rule ID:</strong> <code>${escapeHtml(pr.id)}</code></div>
            <div><strong>Method:</strong> <code>${escapeHtml(pr.method)}</code></div>
            <div><strong>Condition:</strong> <code>${escapeHtml(pr.field)}</code> (${escapeHtml(pr.condition)} ${escapeHtml(pr.targetValue || '')})</div>
            <div><strong>Warning Message:</strong> ${escapeHtml(pr.description)}</div>
          </div>
          <div class="proposal-actions" id="proposal-actions-container">
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-rule">
              <span>Add pre-flight rule</span>
            </button>
            <span class="proposal-note">Requires developer confirmation • Never auto-applied</span>
          </div>
        </div>
      `;
    }

    aiResult.innerHTML = `
      <div class="result-status-row">
        <span class="status-badge-inline tag-accent">Diagnosis Complete</span>
        <span class="latency-badge">${escapeHtml(data.modelSource)} • ${data.latencyMs}ms</span>
      </div>
      <div class="diag-section">
        <strong class="diag-label">Analysis:</strong>
        <div class="diag-content text-muted">${escapeHtml(diag.explanation || 'No explanation provided')}</div>
      </div>
      <div class="diag-section">
        <strong class="diag-label">Root Cause:</strong>
        <div class="diag-content text-warning">${escapeHtml(diag.rootCause || 'Root cause undetermined')}</div>
      </div>
      ${diffHtml ? `
        <div class="diag-section">
          <strong class="diag-label">Suggested Code Fix:</strong>
          <pre class="diff-block">${diffHtml}</pre>
        </div>
      ` : ''}
      ${diag.suggestedAction ? `
        <div class="diag-action text-info">
          <strong>Action:</strong> ${escapeHtml(diag.suggestedAction)}
        </div>
      ` : ''}
      ${diag.documentationLink ? `
        <div class="diag-doc-link">
          <a href="${escapeHtml(diag.documentationLink)}" target="_blank" rel="noopener noreferrer" class="link-doc">
            Gateway Reference Documentation ↗
          </a>
        </div>
      ` : ''}
      ${proposalHtml}
    `;

    // Wire rule confirmation button if proposal was rendered
    if (diag.proposedRule) {
      const btnAddRule = document.getElementById('btn-add-rule');
      if (btnAddRule) {
        btnAddRule.addEventListener('click', async () => {
          btnAddRule.disabled = true;
          btnAddRule.innerHTML = `<span>Registering rule...</span>`;
          try {
            const confirmRes = await fetch('/api/playground/rules/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ proposedRule: diag.proposedRule })
            });
            const confirmData = await confirmRes.json();
            if (!confirmData.success) {
              throw new Error(confirmData.error || 'Failed to register rule');
            }

            const actionsContainer = document.getElementById('proposal-actions-container');
            if (actionsContainer) {
              actionsContainer.outerHTML = `
                <div class="proposal-confirmed">
                  <div>
                    <span class="text-success fw-600">Rule active in engine</span>
                    <span class="text-muted text-xs ml-2">Persisted to SQLite</span>
                  </div>
                  <button type="button" id="btn-test-rule-now" class="btn btn-primary btn-sm">
                    <span>Test in pre-flight checker ↗</span>
                  </button>
                </div>
              `;

              document.getElementById('btn-test-rule-now')?.addEventListener('click', () => {
                // Populate Pre-Flight editor with the conflicting payload
                pfMethod.value = diag.proposedRule.method;
                pfJsonEditor.value = JSON.stringify({
                  amount: 50000,
                  currency: diag.proposedRule.targetValue || 'USD'
                }, null, 2);
                runPreflightValidation();

                // Smooth scroll up to Pre-Flight engine card
                document.getElementById('preflight-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              });
            }
          } catch (err) {
            alert(`Error adding rule: ${err.message}`);
            btnAddRule.disabled = false;
            btnAddRule.innerHTML = `<span>Add pre-flight rule</span>`;
          }
        });
      }
    }
  } catch (err) {
    clearInterval(timer);
    aiResult.innerHTML = `<div class="text-error">Diagnosis error: ${escapeHtml(err.message)}</div>`;
  } finally {
    btnDiagnose.disabled = false;
    diagnoseSpinner.classList.add('hidden');
    diagnoseBtnText.textContent = 'Translate error';
  }
});

// =============================================================================
// Module 3: Dual-Process Webhook Simulation (Custom Target URL)
// =============================================================================
const btnSimulateWebhooks = document.getElementById('btn-simulate-webhooks');
const webhookSpinner = document.getElementById('webhook-spinner');
const webhookTargetUrlInput = document.getElementById('webhook-target-url');
const outboundLog = document.getElementById('outbound-log');
const inboundLog = document.getElementById('inbound-log');

// Initialize default mock receiver URL from server
async function initWebhookTargetUrl() {
  try {
    const res = await fetch('/api/playground/merchant-url');
    const data = await res.json();
    if (data.url && webhookTargetUrlInput) {
      webhookTargetUrlInput.value = data.url;
      webhookTargetUrlInput.placeholder = data.url;
    }
  } catch {}
}
initWebhookTargetUrl();

btnSimulateWebhooks.addEventListener('click', () => {
  btnSimulateWebhooks.disabled = true;
  webhookSpinner.classList.remove('hidden');

  outboundLog.innerHTML = '';
  inboundLog.innerHTML = '';

  const targetUrl = webhookTargetUrlInput ? webhookTargetUrlInput.value.trim() : '';
  const sseUrl = targetUrl
    ? `/api/playground/simulate-webhooks?targetUrl=${encodeURIComponent(targetUrl)}`
    : '/api/playground/simulate-webhooks';

  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'init') {
        appendLog(outboundLog, `<span class="log-timestamp">[${formatTime()}]</span> ${escapeHtml(data.message)}`);
      } else if (data.type === 'outbound') {
        appendLog(outboundLog, `
          <span class="log-timestamp">[${formatTime()}]</span>
          <span>POST [${data.step}/${data.total}]</span>
          <span class="log-event">${data.event}</span>
          <span class="log-sig">Sig:${data.signatureSnippet}</span>
        `);
      } else if (data.type === 'inbound') {
        appendLog(inboundLog, `
          <span class="log-timestamp">[${formatTime()}]</span>
          <span class="log-success">200 OK</span>
          <span>Verified HMAC-SHA256:</span>
          <span class="log-event">${data.event}</span>
          <span class="log-action">(${data.actionTaken} • ${data.latencyMs}ms)</span>
        `);
      } else if (data.type === 'complete') {
        appendLog(outboundLog, `<span class="log-timestamp">[${formatTime()}]</span> <span class="log-success">[Done] ${data.totalDelivered} events dispatched.</span>`);
        appendLog(inboundLog, `<span class="log-timestamp">[${formatTime()}]</span> <span class="log-success">[Done] 100% signatures verified.</span>`);
        eventSource.close();
        btnSimulateWebhooks.disabled = false;
        webhookSpinner.classList.add('hidden');
      } else if (data.type === 'error') {
        appendLog(outboundLog, `<span class="log-timestamp">[${formatTime()}]</span> <span class="log-error">Error: ${escapeHtml(data.message)}</span>`);
        eventSource.close();
        btnSimulateWebhooks.disabled = false;
        webhookSpinner.classList.add('hidden');
      }
    } catch (err) {
      console.error('SSE parsing error:', err);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    btnSimulateWebhooks.disabled = false;
    webhookSpinner.classList.add('hidden');
  };
});

function appendLog(element, html) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = html;
  element.appendChild(line);
  element.scrollTop = element.scrollHeight;
}

function formatTime() {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
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

// =============================================================================
// Tab 2: Guided Tour (Secondary Automated Mode)
// =============================================================================
let guidedTerm = null;
let guidedFitAddon = null;
let tourSocket = null;

const btnRunTour = document.getElementById('btn-run-tour');
const btnClearTour = document.getElementById('btn-clear-tour');
const tourStatusPill = document.getElementById('tour-status-pill');

function initGuidedTerminal() {
  if (guidedTerm) return;

  guidedTerm = new Terminal({
    cursorBlink: false,
    convertEol: true,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 12.5,
    lineHeight: 1.3,
    theme: {
      background: '#0f172a',
      foreground: '#f8fafc',
      cursor: '#2563eb',
      black: '#1e293b',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#8b5cf6',
      cyan: '#06b6d4',
      white: '#f8fafc'
    }
  });

  guidedFitAddon = new FitAddon.FitAddon();
  guidedTerm.loadAddon(guidedFitAddon);

  const container = document.getElementById('guided-terminal-container');
  guidedTerm.open(container);
  guidedFitAddon.fit();

  printTourIntro();
  setupTourWebSocket();
}

function printTourIntro() {
  guidedTerm.reset();
  guidedTerm.write('\x1b[38;2;37;99;235m[GATEWAY-AI] Guided Integration Tour Console\x1b[0m\r\n');
  guidedTerm.write('\x1b[2mAutomated end-to-end walkthrough of 3 core agentic behaviors.\x1b[0m\r\n');
  guidedTerm.write('─'.repeat(74) + '\r\n');
  guidedTerm.write('\x1b[37mClick "Start Guided Tour" above to execute the scripted test sequence.\x1b[0m\r\n\r\n');
}

function fitGuidedTerm() {
  initGuidedTerminal();
  if (guidedFitAddon) {
    guidedFitAddon.fit();
  }
}

function setupTourWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  tourSocket = new WebSocket(wsUrl);

  tourSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'stream') {
        guidedTerm.write(msg.chunk);
      } else if (msg.type === 'status') {
        if (msg.state === 'running') {
          btnRunTour.disabled = true;
          tourStatusPill.textContent = 'Running';
          tourStatusPill.className = 'pill pill-track';
        } else if (msg.state === 'complete' || msg.state === 'error') {
          btnRunTour.disabled = false;
          tourStatusPill.textContent = msg.state === 'complete' ? 'Completed' : 'Error';
          tourStatusPill.className = 'pill pill-emerald';
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  tourSocket.onclose = () => {
    setTimeout(setupTourWebSocket, 2000);
  };
}

btnRunTour.addEventListener('click', () => {
  if (!tourSocket || tourSocket.readyState !== WebSocket.OPEN) {
    alert('Connecting to server... please wait a moment.');
    return;
  }
  guidedTerm.reset();
  tourSocket.send(JSON.stringify({ action: 'run' }));
});

btnClearTour.addEventListener('click', () => {
  printTourIntro();
});
