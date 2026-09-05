# GateWay-AI

Autonomous local developer agent and drop-in SDK wrapper for payment integrations, built for the Razorpay AI Buildathon (Open Track — Agentic Commerce).

## The Problem

Developers integrating payment gateways lose real engineering time to two recurring, well-documented failure modes:

1. Currency subunit mistakes. Razorpay, like most payment gateways, requires amounts in the smallest currency unit — paise, not rupees. This is a documented, recurring bug, not a hypothetical: real incidents on Razorpay's own issue tracker show a ₹1187 charge silently becoming ₹11.87 because of exactly this confusion.
2. Cryptic gateway errors and manual webhook testing. Opaque error codes such as `BAD_REQUEST_ERROR` or `GATEWAY_ERROR` with no clear resolution path, and manually triggering test webhooks one at a time from a dashboard to verify handler logic.

## The Solution

GateWay-AI is a local developer tool and drop-in SDK wrapper that runs alongside a backend during development. It is not a passive dashboard — it intercepts outbound calls, diagnoses failures using Gemini 2.5 Flash, and fires signed webhooks to a local server, learning from what it diagnoses along the way.

## Architecture

Developer Application
(Express / Next.js / Node.js backend using import { GateWayAI })
|
| (1) Outbound API call, e.g. orders.create
v
GateWay-AI SDK Wrapper
|
v

Pre-Flight Validation Engine
Inspects the outbound request against an extensible rule set
Blocks invalid calls locally (paise decimals, receipt length, etc.)
Returns an actionable code diff; zero network quota wasted
|
| (if passed)
v
Mock Payment Gateway & State Engine
Simulates order creation, payment capture, and refund states
Persists state to SQLite (.gateway-ai/gateway.db)
|
|-- on gateway error --------------> 2. AI Error Translator
| - Sends the error to Gemini 2.5 Flash
| via structured tool calling
| - Returns explanation, root cause,
| code fix, and a proposed pre-flight
| rule when the failure is preventable
|
|-- on payment success ------------> 3. Agentic Webhook Simulator
- Autonomously builds and signs the
event sequence (authorized -> paid
-> captured)
- Delivers via native fetch to the
developer's local endpoint



## Core Behaviors

### 1. Pre-Flight Validation Rules Engine

Before an outbound request reaches the network or mock gateway, it is checked against a rule engine covering realistic integration mistakes:

- Currency subunits: detects decimals such as 500.50 and requires integer paise (50050)
- Minimum thresholds: enforces the ₹1.00 (100 subunit) minimum
- ISO-4217 currency format: rejects lowercase or malformed currency codes
- Receipt length: enforces Razorpay's 40-character limit
- Notes constraints: limits key-value pair count and length
- Extensible: new rules can be registered manually via `gateway.registerRule(...)`, or proposed automatically (see below)

### 2. AI Error Translator and Self-Improving Rule Loop

When a request fails, GateWay-AI sends the error to Gemini 2.5 Flash using structured tool calling (`report_error_diagnosis`). All error scenarios follow Razorpay's actual documented error response schema (https://razorpay.com/docs/payments/payment-gateway/rainy-day/errors/error-codes), not an invented format:

```json
{
  "error": {
    "code": "BAD_REQUEST_ERROR",
    "description": "Payment currency (USD) does not match the original order currency (INR)",
    "field": "currency",
    "source": "business",
    "step": "payment_capture",
    "reason": "currency_mismatch",
    "metadata": { "payment_id": "pay_...", "order_id": "order_..." }
  }
}
```

The model returns a structured diagnosis: a plain-English explanation, the technical root cause, a concrete code fix, a suggested next step with reference documentation, and, when the failure represents a repeatable pattern, a proposed pre-flight rule.

This is what makes the system self-improving rather than purely reactive. When a proposed rule is approved, it is compiled into the local validation engine and persisted to SQLite. The identical mistake is then caught locally, in under a millisecond, with no further AI calls required.

An offline local-reasoning fallback is included, so the full loop works without a `GEMINI_API_KEY`.

### 3. Agentic Webhook Simulator

On a successful mock payment, the agent autonomously constructs and dispatches the full webhook lifecycle to the developer's server: `payment.authorized`, then `order.paid`, then `payment.captured`. Each event is signed with a real HMAC-SHA256 `X-Razorpay-Signature` header and delivered via native `fetch`, without manual dashboard triggering.

## Local Setup

```bash
git clone https://github.com/your-username/GateWay-AI.git
cd GateWay-AI
npm install
```

Optional environment configuration:

```bash
cp .env.example .env
```

GEMINI_API_KEY=your_gemini_api_key_here
ADMIN_PASSWORD=choose_your_own_password
GATEWAY_WEBHOOK_URL=http://localhost:3000/webhook
GATEWAY_WEBHOOK_SECRET=gateway_ai_secret_xyz123


`GEMINI_API_KEY` is optional. The offline reasoning engine works without it.

Run the interactive web console:

```bash
npm run web
```

- Console: http://localhost:3000
- Admin telemetry view: http://localhost:3000/admin (kept off the main navigation for a cleaner reviewer flow, not a security boundary; password set via `ADMIN_PASSWORD`)

Run the scripted demo:

```bash
npm run demo
```

Run the automated test suite:

```bash
npm test
```

CLI utilities:

```bash
node bin/gateway-ai.js rules
node bin/gateway-ai.js logs
node bin/gateway-ai.js listen --port 3000
node bin/gateway-ai.js clear
```

## SDK Usage

```javascript
import { GateWayAI } from 'gateway-ai';

const gateway = new GateWayAI({
  key_id: 'rzp_test_12345',
  key_secret: 'secret_abc',
  webhook_secret: 'gateway_ai_secret_xyz123',
  webhook_url: 'http://localhost:3000/webhook'
});

const order = await gateway.orders.create({
  amount: 50000, // paise, equivalent to ₹500
  currency: 'INR',
  receipt: 'rcpt_order_101'
});

await gateway.simulatePaymentSuccess(order.id, {
  method: 'upi',
  vpa: 'customer@okhdfcbank'
});
```

```javascript
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!gateway.verifyWebhookSignature(req.body, signature)) {
    return res.status(400).send('Invalid signature');
  }
  console.log(`Received verified event: ${req.body.event}`);
  res.status(200).send('OK');
});
```

## Technical Notes

- SDK wrapper, not a network proxy. Runs as a function wrapper in userland code; no TLS interception or certificate management required.
- Real relational persistence via SQLite (`better-sqlite3`), with origin tracking that distinguishes built-in rules from AI-learned ones.
- Local-first. Runs entirely offline, with an optional live call to Gemini for LLM reasoning.
- Production-shaped signatures. Real HMAC-SHA256 generation, so webhook handler code written against this is genuinely production-compatible.

## Built for Razorpay AI Buildathon 2026

Track: Open Track (Agentic Commerce)
AI Engine: Gemini 2.5 Flash (`@google/genai`)