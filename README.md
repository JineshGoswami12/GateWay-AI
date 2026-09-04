# ⚡ GateWay-AI

**Autonomous Local Developer Agent & Drop-in SDK Companion for Payment Integrations**  
*Razorpay AI Buildathon — Open Track (Agentic Commerce)*

[![Node.js](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org)
[![Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%202.5%20Flash-purple.svg)](https://ai.google.dev)
[![Buildathon](https://img.shields.io/badge/Track-Agentic%20Commerce-blue.svg)](https://razorpay.com)
[![License](https://img.shields.io/badge/License-MIT-gray.svg)](LICENSE)

---

## 🌐 Live Hosted Web Console (For Judges & Reviewers)

> [!TIP]
> **Interact with the live developer console directly in your browser without installing anything:**  
> 🔗 **Public Console**: `https://gateway-ai-demo.onrender.com` *(placeholder — deploy via Render)*  
> 📊 **Admin Telemetry View**: `https://gateway-ai-demo.onrender.com/admin`  
> - Kept off the main navigation to avoid cluttering the reviewer flow, not a security boundary. Passcode configured via `process.env.ADMIN_PASSWORD` (demo default: `gateway-admin-2026`).
> 
> *⚠️ Note on Free-Tier Hosting & Persistence:*  
> - Free-tier instances (Render) spin down when idle; initial cold boot takes ~30–60 seconds.  
> - Because free-tier containers have ephemeral disks, the SQLite database (`.gateway-ai/gateway.db`) auto-seeds with realistic developer history on boot so you never face a blank slate.  
> - Persistent disks are fully supported via `DB_PATH=/var/data/gateway.db` for production deployments.

The web console is structured into two purpose-built environments:
1. **Public Developer Console (`/`)**:
   - **Interactive Playground**: Open-ended developer testing with a free-form raw JSON editor for local pre-flight checks, open-ended gateway error translation via Gemini 2.5 Flash function calling, self-improving rule loop proposals, and dual-process webhook lifecycle simulation with configurable target endpoints.
   - **Guided Tour Mode**: An automated 60-second end-to-end integration walkthrough streaming live into an xterm.js terminal.
2. **Admin Telemetry View (`/admin`)**:
   - Kept off the main navigation to avoid cluttering the reviewer flow, not a security boundary (passcode configured via `ADMIN_PASSWORD` for reviewer convenience).
   - Live aggregate telemetry: Total validations, local block rate %, AI error diagnoses, and active rules (built-in + AI-learned).
   - Relational SQLite audit trail: Structured tables for validation logs, AI reasoning diagnoses, webhook deliveries, and rules engine state with a protected type-to-confirm clear action.

---

## 💡 The Problem

Developers integrating payment gateways spend excessive engineering hours on two major friction points:
1. **Cryptic Gateway Errors**: Deciphering obscure API error codes with vague descriptions (`BAD_REQUEST_ERROR`, `GATEWAY_ERROR`), hunting through external documentation, and guessing what payload field was malformed.
2. **Manual Webhook Testing**: Switching tabs to a cloud dashboard to manually trigger mock webhook events one by one to verify their webhook listener logic.

## 🚀 The Solution: GateWay-AI

**GateWay-AI** is a local developer tool and drop-in SDK wrapper that runs alongside your backend during local development. It is **not a passive dashboard**—it is an autonomous agent that intercepts outbound calls, diagnoses errors using **Gemini 2.5 Flash**, and fires multi-stage HMAC-signed webhooks to your local server.

```
+-----------------------------------------------------------------------------------+
|                            Developer Application                                  |
|  (e.g., Express / Next.js / Node.js backend using import { GateWayAI })           |
+-----------------------------------------------------------------------------------+
                                   |
                  (1) Outbound API Call (e.g. orders.create)
                                   v
+-----------------------------------------------------------------------------------+
|                            GateWay-AI SDK Wrapper                                 |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | 1. Pre-Flight Validation Engine                                           |   |
|   | - Inspects outbound request against extensible rules                      |   |
|   | - Blocks invalid calls locally (paise decimals, receipt length, etc.)      |   |
|   | - Renders actionable terminal diff; zero network quota wasted             |   |
|   +---------------------------------------------------------------------------+   |
|                                   | (If Passed)                                   |
|                                   v                                               |
|   +---------------------------------------------------------------------------+   |
|   | Mock Payment Gateway & State Engine                                       |   |
|   | - Simulates Razorpay order creation, payment capture, refund states       |   |
|   | - Persists state to SQLite database (.gateway-ai/gateway.db)              |   |
|   +---------------------------------------------------------------------------+   |
|            |                                              |                       |
|   (On Gateway Error)                               (On Payment Success)           |
|            v                                              v                       |
|   +----------------------------------+     +----------------------------------+   |
|   | 2. AI Error Translator           |     | 3. Agentic Webhook Simulator     |   |
|   | - Intercepts gateway error       |     | - Autonomously constructs event  |   |
|   | - Calls Gemini 2.5 Flash via     |     |   sequence (auth -> paid -> cap) |   |
|   |   @google/genai tool-calling     |     | - Signs payload with HMAC-SHA256 |   |
|   | - Structured schema:             |     |   header: X-Razorpay-Signature   |   |
|   |   { explanation, rootCause,      |     | - Dispatches via native fetch    |   |
|   |     codeFix, suggestedAction,    |     |   to local webhook endpoint      |   |
|   |     proposedRule }               |     | - Live delivery & latency logs   |   |
|   | - Proposes pre-flight rules into |     +----------------------------------+   |
|   |   the self-improving loop        |                                            |
|   +----------------------------------+                                            |
+-----------------------------------------------------------------------------------+
```

---

## 🎯 Core Agentic Behaviors

### 1. Pre-Flight Validation Rules Engine
Before an outbound API request ever reaches the network or mock gateway, the wrapper inspects it against a rule engine covering realistic payment integration mistakes:
- **Currency Subunits**: Detects floating-point decimals (`500.50`) and instructs conversion to integer paise (`50050`).
- **Minimum Thresholds**: Enforces ₹1.00 (100 paise) minimum transaction size.
- **ISO-4217 Currency**: Enforces uppercase standard currency codes (rejects `"inr"` or `"₹"`).
- **Receipt Length**: Catches strings exceeding Razorpay's 40-character limit.
- **Notes Constraints**: Limits custom notes to 15 key-value pairs (keys <= 30 chars, values <= 256 chars).
- **Extensible**: Add custom team rules with `gateway.registerRule(...)`.

### 2. AI Error Translator & Self-Improving Rule Loop (Gemini 2.5 Flash)
When a request fails against the gateway, GateWay-AI intercepts the error and invokes **Gemini 2.5 Flash** using structured tool calling (`report_error_diagnosis`).

> [!NOTE]
> **Documented Error Schema Accuracy**: All mock errors, catalog scenarios, and AI translation inputs adhere strictly to [Razorpay's Documented Error Response Schema](https://razorpay.com/docs/payments/payment-gateway/rainy-day/errors/error-codes):
> ```json
> {
>   "error": {
>     "code": "BAD_REQUEST_ERROR",
>     "description": "Payment currency (USD) does not match the original order currency (INR)",
>     "field": "currency",
>     "source": "business",
>     "step": "payment_capture",
>     "reason": "currency_mismatch",
>     "metadata": { "payment_id": "pay_...", "order_id": "order_..." }
>   }
> }
> ```
> Error taxonomies (`source: customer|business|gateway|bank|network`, `step: payment_capture|order_creation|payment_authentication`, and specific reason codes) match official gateway specifications rather than invented formats.

The model returns a strictly typed diagnosis:
- **Plain-English Explanation**: What went wrong in clear terms.
- **Root Cause**: The technical reason behind the gateway rejection.
- **Concrete Code Fix**: A colorized diff showing actionable code changes.
- **Suggested Next Step & Reference Docs**: Direct guidance on resolution.
- **Self-Improving Pre-Flight Rule Proposal**: If the failure represents a repeatable schema error, the AI proposes a new pre-flight rule. When approved by the developer, it is compiled into the local validation engine and persisted to SQLite—preventing future identical mistakes in <1ms without contacting the gateway.

*(Includes an automatic local fallback reasoning engine for 100% reliable offline testing).*

### 3. Agentic Webhook Simulator
When a payment succeeds, the agent autonomously constructs and dispatches the multi-step webhook lifecycle to your server:
1. `payment.authorized` (Bank authorization)
2. `order.paid` (Order marked paid)
3. `payment.captured` (Funds captured)
- **Authentic Signatures**: Computes real HMAC-SHA256 signatures in `X-Razorpay-Signature` using your configured secret.
- **Native Delivery**: Dispatches via native Node.js `fetch` to your designated webhook endpoint.
- **Dual UI Panels**: Separate Outbound Dispatch Agent and Inbound Merchant Receiver status.

---

## 💻 Local Developer Setup & CLI Demo

### 1. Clone and Install
```bash
git clone https://github.com/your-username/GateWay-AI.git
cd GateWay-AI
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```
Add your Gemini API key (or leave empty to use the built-in offline engine):
```env
GEMINI_API_KEY=your_gemini_api_key_here
ADMIN_PASSWORD=gateway-admin-2026
GATEWAY_WEBHOOK_URL=http://localhost:3000/webhook
GATEWAY_WEBHOOK_SECRET=gateway_ai_secret_xyz123
```

### 3. Run the Live 60-Second Demo
```bash
npm run demo
```
Runs through all 3 agentic scenarios automatically in non-interactive mode.

### 4. Run Automated Tests
```bash
npm test
```

### 5. CLI Utility Commands
```bash
# View all active pre-flight rules
node bin/gateway-ai.js rules

# Inspect local history of orders, webhooks, and AI errors
node bin/gateway-ai.js logs

# Start a local webhook listener to inspect incoming webhooks
node bin/gateway-ai.js listen --port 3000

# Clear local state (.gateway-ai/)
node bin/gateway-ai.js clear
```

### 6. Run Web Console Locally
```bash
npm run web
```
- Public Console: `http://localhost:3000`
- Admin Telemetry View: `http://localhost:3000/admin` (Passcode configured via `ADMIN_PASSWORD` in `.env`)

---

## 🛠 Developer SDK Usage

### Drop-in Razorpay Replacement

```javascript
import { GateWayAI } from 'gateway-ai';

const gateway = new GateWayAI({
  key_id: 'rzp_test_12345',
  key_secret: 'secret_abc',
  webhook_secret: 'gateway_ai_secret_xyz123',
  webhook_url: 'http://localhost:3000/webhook'
});

// 1. Create an order (Pre-flight automatically checks parameters)
const order = await gateway.orders.create({
  amount: 50000, // 50000 paise = ₹500
  currency: 'INR',
  receipt: 'rcpt_order_101'
});

// 2. Simulate customer payment (Autonomous agent fires signed webhooks)
await gateway.simulatePaymentSuccess(order.id, {
  method: 'upi',
  vpa: 'customer@okhdfcbank'
});
```

### In Your Merchant Webhook Handler

```javascript
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const isValid = gateway.verifyWebhookSignature(req.body, signature);

  if (!isValid) return res.status(400).send('Invalid signature');

  console.log(`Received verified event: ${req.body.event}`);
  res.status(200).send('OK');
});
```

---

## 🔒 Technical Constraints & Compliance
- **No Network Proxy / TLS Interception**: Runs purely as a function wrapper imported in userland code.
- **Zero Heavy Infrastructure**: Built with SQLite (`better-sqlite3`) for lightweight, reliable relational persistence.
- **Pure Localhost Operation**: Runs entirely offline/local, with optional external call to Gemini API for live LLM reasoning.
- **Production-Grade Signatures**: HMAC-SHA256 generation ensures developer webhook handling code is production-ready.

---

## 🏆 Built for Razorpay AI Buildathon 2026
- **Track**: Open Track (Agentic Commerce)
- **Engine**: Gemini 2.5 Flash (`@google/genai`)
- **Focus**: Developer Experience (DX) & Autonomous Agentic Workflow
