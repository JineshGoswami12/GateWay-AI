import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { GateWayAI, signPayload, compileDeclarativeRule } from '../src/index.js';
import * as db from '../src/storage/db.js';
import { runDemo, createMerchantApp } from '../demo/run-demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global GateWayAI instance for playground requests
const gateway = new GateWayAI({
  key_id: 'rzp_test_playground_user',
  key_secret: 'secret_playground_key_123',
  webhook_secret: 'gateway_ai_secret_xyz123'
});

// Load previously confirmed AI rules from SQLite
db.loadCustomRules(gateway.rulesEngine);

// Setup background merchant receiver for webhooks
const { app: merchantApp } = createMerchantApp({ webhookSecret: 'gateway_ai_secret_xyz123' });
let merchantHttpServer = null;
let merchantPort = 0;

async function ensureMerchantReceiver() {
  if (merchantHttpServer) return merchantPort;
  merchantHttpServer = http.createServer(merchantApp);
  await new Promise((resolve) => {
    merchantHttpServer.listen(0, () => {
      merchantPort = merchantHttpServer.address().port;
      resolve();
    });
  });
  return merchantPort;
}

// -----------------------------------------------------------------------------
// Health Check Endpoint
// -----------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gateway-ai-web-console',
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    sqliteConnected: true,
    timestamp: new Date().toISOString()
  });
});

// -----------------------------------------------------------------------------
// Interactive Playground API: Pre-Flight Rule Checker
// -----------------------------------------------------------------------------
app.post('/api/playground/validate', (req, res) => {
  const startTime = performance.now();
  const method = req.body.method || 'orders.create';
  const payload = req.body.payload || {};

  // Run through actual rules engine
  const violations = gateway.rulesEngine.validate(method, payload);
  const latencyMs = Number((performance.now() - startTime).toFixed(2));
  const passed = violations.length === 0;

  if (passed) {
    db.recordValidation({
      method,
      payload,
      passed: true,
      latencyMs
    });

    return res.json({
      passed: true,
      method,
      payload,
      latencyMs,
      message: 'Outbound request passed all pre-flight validation rules.'
    });
  }

  const primary = violations[0];
  let ruleOrigin = 'built_in';
  try {
    const row = db.db.prepare('SELECT origin FROM rules WHERE rule_id = ?').get(primary.ruleId);
    if (row && row.origin) ruleOrigin = row.origin;
  } catch {}

  db.recordValidation({
    method,
    payload,
    passed: false,
    ruleId: primary.ruleId,
    errorDescription: primary.description,
    fixSuggestion: primary.fixSuggestion,
    latencyMs,
    ruleOrigin
  });

  return res.json({
    passed: false,
    method,
    payload,
    latencyMs,
    ruleId: primary.ruleId,
    description: primary.description,
    violation: primary.violation,
    fixSuggestion: primary.fixSuggestion,
    ruleOrigin
  });
});

// -----------------------------------------------------------------------------
// Interactive Playground API: Rules Engine Inspection & Confirmation
// -----------------------------------------------------------------------------
app.get('/api/playground/rules', (req, res) => {
  try {
    const rules = db.getAllRules();
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playground/rules/confirm', (req, res) => {
  const { proposedRule } = req.body;
  if (!proposedRule || !proposedRule.id || !proposedRule.method) {
    return res.status(400).json({
      success: false,
      error: 'Missing required proposedRule object with id and method.'
    });
  }

  try {
    // 1. Compile declarative rule into standard RulesEngine format
    const compiled = compileDeclarativeRule({
      ...proposedRule,
      origin: 'ai_proposed'
    });

    // 2. Register into memory
    gateway.rulesEngine.register(compiled);

    // 3. Persist to SQLite
    db.recordRule({
      ...proposedRule,
      origin: 'ai_proposed'
    });

    return res.json({
      success: true,
      message: `Rule [${proposedRule.id}] successfully confirmed and registered in pre-flight engine.`,
      rule: {
        id: compiled.id,
        method: compiled.method,
        description: compiled.description,
        origin: 'ai_proposed'
      },
      metrics: db.getMetrics()
    });
  } catch (err) {
    console.error('Failed to confirm rule:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Interactive Playground API: AI Error Translation (Gemini 2.5 Flash)
// -----------------------------------------------------------------------------
app.post('/api/playground/diagnose', async (req, res) => {
  const { scenario, customError, rawError, customPayload, method: reqMethod, endpoint: reqEndpoint } = req.body;
  const startTime = Date.now();

  let error = null;
  let method = reqMethod || 'payments.capture';
  let endpoint = reqEndpoint || '/v1/payments/capture';
  let requestPayload = customPayload || {};

  if (rawError) {
    if (typeof rawError === 'object') {
      error = rawError.error || rawError;
    } else {
      try {
        const parsed = JSON.parse(rawError);
        error = parsed.error || parsed;
      } catch {
        error = {
          code: 'BAD_REQUEST_ERROR',
          description: String(rawError).trim(),
          field: null,
          source: 'business',
          step: 'payment_capture',
          reason: 'invalid_request',
          metadata: {}
        };
      }
    }
    if (!error.code) error.code = 'BAD_REQUEST_ERROR';
    if (!error.description && error.message) error.description = error.message;
    if (error.field === undefined) error.field = null;
    if (!error.source) error.source = 'business';
    if (!error.step) error.step = 'payment_capture';
    if (!error.reason) error.reason = 'invalid_request';
    if (!error.metadata) error.metadata = {};
  } else if (scenario === 'currency_mismatch') {
    error = {
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
    };
    requestPayload = { amount: 50000, currency: 'USD' };
    method = 'payments.capture';
    endpoint = '/v1/payments/pay_demo_101/capture';
  } else if (scenario === 'already_captured') {
    error = {
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
    };
    requestPayload = { amount: 50000 };
    method = 'payments.capture';
    endpoint = '/v1/payments/pay_demo_102/capture';
  } else if (scenario === 'duplicate_receipt') {
    error = {
      code: 'BAD_REQUEST_ERROR',
      description: 'Order with this receipt ID already exists',
      field: 'receipt',
      source: 'business',
      step: 'order_creation',
      reason: 'duplicate_receipt',
      metadata: {
        receipt: 'rcpt_campaign_duplicate_001'
      }
    };
    requestPayload = { amount: 50000, currency: 'INR', receipt: 'rcpt_campaign_duplicate_001' };
    method = 'orders.create';
    endpoint = '/v1/orders';
  } else {
    error = customError || {
      code: 'BAD_REQUEST_ERROR',
      description: 'The requested order or payment parameters are invalid',
      field: null,
      source: 'business',
      step: 'payment_capture',
      reason: 'invalid_request',
      metadata: {}
    };
    requestPayload = customPayload || {};
    method = req.body.method || 'payments.capture';
  }

  try {
    const diagnosis = await gateway.translator.diagnose({
      error,
      method,
      requestPayload,
      endpoint
    });

    const latencyMs = Date.now() - startTime;
    const modelSource = (process.env.GEMINI_API_KEY && gateway.translator.client)
      ? 'gemini-2.5-flash'
      : 'local_fallback';

    db.recordDiagnosis({
      method,
      endpoint,
      errorCode: error.code || 'GATEWAY_ERROR',
      errorDescription: error.description || error.reason,
      modelSource,
      explanation: diagnosis.explanation,
      rootCause: diagnosis.rootCause,
      codeFix: diagnosis.codeFix,
      suggestedAction: diagnosis.suggestedAction,
      documentationLink: diagnosis.documentationLink,
      latencyMs
    });

    return res.json({
      success: true,
      error,
      method,
      endpoint,
      requestPayload,
      diagnosis,
      modelSource,
      latencyMs
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// -----------------------------------------------------------------------------
// Interactive Playground API: Dual-Process Webhook Simulation (SSE Stream)
// -----------------------------------------------------------------------------
app.get('/api/playground/simulate-webhooks', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const targetPort = await ensureMerchantReceiver();
    const defaultTargetUrl = `http://localhost:${targetPort}/webhook`;
    const targetUrl = (req.query.targetUrl && req.query.targetUrl.trim()) ? req.query.targetUrl.trim() : defaultTargetUrl;
    const secret = 'gateway_ai_secret_xyz123';

    sendEvent({
      type: 'init',
      targetUrl,
      message: `Simulating dual-process payment lifecycle. Target: ${targetUrl}`
    });

    const events = [
      {
        name: 'payment.authorized',
        payload: {
          entity: 'event',
          event: 'payment.authorized',
          payload: {
            payment: {
              id: `pay_${Date.now()}`,
              amount: 50000,
              currency: 'INR',
              status: 'authorized',
              method: 'upi'
            }
          },
          created_at: Math.floor(Date.now() / 1000)
        }
      },
      {
        name: 'order.paid',
        payload: {
          entity: 'event',
          event: 'order.paid',
          payload: {
            order: {
              id: `order_${Date.now()}`,
              amount: 50000,
              currency: 'INR',
              status: 'paid'
            }
          },
          created_at: Math.floor(Date.now() / 1000)
        }
      },
      {
        name: 'payment.captured',
        payload: {
          entity: 'event',
          event: 'payment.captured',
          payload: {
            payment: {
              id: `pay_${Date.now()}`,
              amount: 50000,
              currency: 'INR',
              status: 'captured'
            }
          },
          created_at: Math.floor(Date.now() / 1000)
        }
      }
    ];

    for (let i = 0; i < events.length; i++) {
      const { name, payload } = events[i];
      const rawBody = JSON.stringify(payload);
      const signature = signPayload(rawBody, secret);
      const eventId = `evt_${Date.now()}_${i + 1}`;

      // 1. Emit outbound dispatch event
      sendEvent({
        type: 'outbound',
        step: i + 1,
        total: events.length,
        event: name,
        eventId,
        targetUrl,
        signatureSnippet: signature.slice(0, 16) + '...',
        timestamp: new Date().toISOString()
      });

      const startTime = performance.now();
      let statusCode = 200;
      let error = null;

      try {
        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Razorpay-Signature': signature,
            'X-Razorpay-Event-Id': eventId
          },
          body: rawBody
        });
        statusCode = resp.status;
      } catch (err) {
        statusCode = 500;
        error = err.message;
      }

      const latencyMs = Number((performance.now() - startTime).toFixed(1));

      // 2. Emit inbound merchant server log
      sendEvent({
        type: 'inbound',
        step: i + 1,
        event: name,
        eventId,
        statusCode,
        signatureVerified: statusCode === 200,
        latencyMs,
        actionTaken: name === 'order.paid' ? 'Inventory reserved for order' : 'Status updated',
        timestamp: new Date().toISOString()
      });

      // Record to SQLite
      db.recordWebhookDelivery({
        id: eventId,
        event: name,
        targetUrl,
        signatureVerified: statusCode === 200,
        statusCode,
        latencyMs,
        payload
      });

      await sleep(350);
    }

    sendEvent({
      type: 'complete',
      totalDelivered: events.length,
      metrics: db.getMetrics()
    });

    res.end();
  } catch (err) {
    sendEvent({ type: 'error', message: err.message });
    res.end();
  }
});

// -----------------------------------------------------------------------------
// Interactive Playground API: Default Merchant Receiver URL
// -----------------------------------------------------------------------------
app.get('/api/playground/merchant-url', async (req, res) => {
  try {
    const targetPort = await ensureMerchantReceiver();
    res.json({ success: true, defaultUrl: `http://localhost:${targetPort}/webhook` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Admin Telemetry View (/admin)
// Kept off main navigation to avoid cluttering reviewer flow; not a security boundary.
// -----------------------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.warn('[SECURITY WARNING] ADMIN_PASSWORD environment variable is not configured. Admin telemetry access will be disabled until set.');
}
const validAdminTokens = new Set();

function generateAdminToken() {
  const token = 'adm_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  validAdminTokens.add(token);
  return token;
}

function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : req.headers['x-admin-token'] || req.query.token;

  if (!token || !validAdminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Admin authentication token required'
    });
  }
  next();
}

// Serve separate dedicated Admin Portal page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin authentication endpoint
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      success: false,
      error: 'Admin access disabled: ADMIN_PASSWORD environment variable is not configured on this server.'
    });
  }

  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: 'Invalid administrator password.'
    });
  }

  const token = generateAdminToken();
  return res.json({
    success: true,
    token,
    message: 'Authentication successful.'
  });
});

// Gated admin data endpoint (returns metrics and all history tables)
app.get('/api/admin/data', verifyAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const metrics = db.getMetrics();
  const history = db.getHistory(limit);

  res.json({
    success: true,
    metrics,
    history
  });
});

// Gated admin clear history endpoint
app.post('/api/admin/clear', verifyAdmin, (req, res) => {
  db.clearHistory();
  res.json({
    success: true,
    message: 'Activity history cleared from SQLite.',
    metrics: db.getMetrics()
  });
});

// -----------------------------------------------------------------------------
// Guided Tour WebSocket Server
// -----------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let isGuidedTourRunning = false;

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'ready',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    isGuidedTourRunning
  }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.action === 'run') {
        if (isGuidedTourRunning) {
          ws.send(JSON.stringify({
            type: 'stream',
            chunk: '\r\n\x1b[33m[NOTICE] A guided tour is already in progress. Please wait a moment.\x1b[0m\r\n'
          }));
          return;
        }

        isGuidedTourRunning = true;
        ws.send(JSON.stringify({ type: 'status', state: 'running' }));

        try {
          await runDemo({
            clearScreen: false,
            merchantPort: 0,
            onLog: (chunk) => {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  type: 'stream',
                  chunk
                }));
              }
            }
          });

          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'status', state: 'complete' }));
          }
        } catch (err) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'stream',
              chunk: `\r\n\x1b[31m[ERROR] Demo execution halted: ${err.message}\x1b[0m\r\n`
            }));
            ws.send(JSON.stringify({ type: 'status', state: 'error', error: err.message }));
          }
        } finally {
          isGuidedTourRunning = false;
        }
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\nGateWay-AI Developer Console active on http://localhost:${PORT}`);
  console.log(`AI Engine: ${process.env.GEMINI_API_KEY ? 'Gemini 2.5 Flash' : 'Built-in Offline Fallback'}`);
  console.log(`Persistence: SQLite (.gateway-ai/gateway.db)`);
  if (!ADMIN_PASSWORD) {
    console.warn(`Admin Route: UNCONFIGURED (Set ADMIN_PASSWORD in environment to enable admin login)`);
  } else {
    console.log(`Admin Route: Protected via ADMIN_PASSWORD environment variable`);
  }
});
