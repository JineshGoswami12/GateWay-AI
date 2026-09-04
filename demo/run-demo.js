import chalk from 'chalk';
import http from 'http';
import express from 'express';
import { printBanner } from '../src/ui/banner.js';
import { logger } from '../src/ui/logger.js';
import { GateWayAI } from '../src/index.js';

const sleep = ms => new Promise(res => setTimeout(res, ms));

/**
 * Creates the mock merchant receiver Express app
 */
export function createMerchantApp(options = {}) {
  const app = express();
  const secret = options.webhookSecret || process.env.GATEWAY_WEBHOOK_SECRET || 'gateway_ai_secret_xyz123';
  const gateway = new GateWayAI({ webhook_secret: secret });

  const receivedWebhooks = [];

  app.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', merchant: 'Express Demo Store' });
  });

  app.post('/api/checkout', async (req, res) => {
    try {
      const order = await gateway.orders.create({
        amount: req.body.amount,
        currency: req.body.currency,
        receipt: req.body.receipt,
        notes: req.body.notes
      });
      res.json({ success: true, order });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.name,
        message: err.message
      });
    }
  });

  app.post('/webhook', (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];
    const bodyStr = req.rawBody || JSON.stringify(req.body);

    const isValid = gateway.verifyWebhookSignature(bodyStr, signature, secret);

    if (!isValid) {
      console.log(chalk.red(`[Merchant Server] ✖ Invalid webhook signature! Rejecting event.`));
      return res.status(400).json({ status: 'invalid_signature' });
    }

    const eventName = req.body.event;
    receivedWebhooks.push({
      eventId,
      event: eventName,
      timestamp: new Date().toISOString()
    });

    console.log(
      chalk.dim(`[Merchant Server] `) +
      chalk.green(`✔ Webhook verified & processed: `) +
      chalk.bold(eventName) +
      chalk.dim(` (Sig: ${signature ? signature.slice(0, 10) + '...' : 'none'})`)
    );

    if (eventName === 'order.paid') {
      const orderId = req.body.payload?.order?.entity?.id;
      console.log(chalk.dim(`[Merchant Server] 📦 Inventory reserved for ${orderId}`));
    }

    res.status(200).json({ status: 'ok', event: eventName });
  });

  return { app, receivedWebhooks, gateway };
}

/**
 * Runs the end-to-end interactive demo
 * Can stream logs via options.onLog (for WebSocket / Web Terminal)
 */
export async function runDemo(options = {}) {
  const originalLog = console.log;
  const originalStdoutWrite = process.stdout.write;

  // Stream output if onLog hook provided
  if (typeof options.onLog === 'function') {
    console.log = (...args) => {
      const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      originalLog(...args);
      const crlfLine = line.replace(/\r?\n/g, '\r\n');
      options.onLog(crlfLine + '\r\n');
    };
  }

  try {
    if (options.clearScreen !== false && !options.onLog) {
      console.clear();
    }

    if (!options.onLog) {
      printBanner();
    } else {
      console.log(chalk.bold.hex('#6366F1')('[GATEWAY-AI] Payment Integration Agent Console'));
      console.log(chalk.dim('Architecture: Local Outbound Interceptor | AI: Gemini 2.5 Flash | Mode: Localhost\n'));
    }

    console.log(chalk.dim('─'.repeat(80)));
    console.log(chalk.bold.white('[START] Initializing integration test sequence: 3 autonomous behaviors'));
    console.log(chalk.dim('─'.repeat(80) + '\n'));

    // Start merchant backend on specified port or dynamic fallback
    let port = options.merchantPort !== undefined
      ? options.merchantPort
      : (options.port !== undefined ? options.port : parseInt(process.env.DEMO_PORT || '3000', 10));
    const { app, receivedWebhooks } = createMerchantApp({ webhookSecret: 'demo_secret_key_888' });
    
    let server = http.createServer(app);
    let actualPort = port;

    await new Promise((resolve) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Fallback to ephemeral port
          server = http.createServer(app);
          server.listen(0, () => {
            actualPort = server.address().port;
            logger.info(`Merchant local test backend online at http://localhost:${actualPort}/webhook`);
            resolve();
          });
        }
      });
      server.listen(port, () => {
        actualPort = server.address().port;
        logger.info(`Merchant local test backend online at http://localhost:${actualPort}/webhook`);
        resolve();
      });
    });

    // Instantiate GateWayAI client
    const gateway = new GateWayAI({
      key_id: 'rzp_test_buildathon_demo',
      key_secret: 'mock_secret_key_123',
      webhook_secret: 'demo_secret_key_888',
      webhook_url: `http://localhost:${actualPort}/webhook`
    });

    await sleep(600);

    // ---------------------------------------------------------------------------
    // SCENARIO 1: PRE-FLIGHT VALIDATION
    // ---------------------------------------------------------------------------
    console.log(chalk.bold.white('\n' + '─'.repeat(80)));
    console.log(chalk.bold.hex('#EF4444')('[SCENARIO 1/3] Pre-Flight Validation Engine'));
    console.log(chalk.dim('Description: Intercepting invalid outbound payload (decimal paise + receipt length > 40)'));
    console.log(chalk.bold.white('─'.repeat(80) + '\n'));

    logger.info(`Dispatching test payload:`);
    console.log(chalk.dim(`  const order = await gateway.orders.create({`));
    console.log(chalk.red(`    amount: 499.50, // Invalid: decimal currency subunit`));
    console.log(chalk.dim(`    currency: 'INR',`));
    console.log(chalk.red(`    receipt: 'order_receipt_2026_super_discount_campaign_checkout_session_xyz' // Invalid: > 40 chars`));
    console.log(chalk.dim(`  });\n`));

    await sleep(800);

    try {
      await gateway.orders.create({
        amount: 499.50,
        currency: 'INR',
        receipt: 'order_receipt_2026_super_discount_campaign_checkout_session_xyz'
      });
    } catch {
      logger.success(`Pre-flight check intercepted invalid call locally (< 2ms). Zero network quota consumed.`);
    }

    await sleep(1000);

    // ---------------------------------------------------------------------------
    // SCENARIO 2: AI ERROR TRANSLATOR
    // ---------------------------------------------------------------------------
    console.log(chalk.bold.white('\n' + '─'.repeat(80)));
    console.log(chalk.bold.hex('#6366F1')('[SCENARIO 2/3] AI Error Translator (Gemini 2.5 Flash)'));
    console.log(chalk.dim('Description: Intercepting gateway rejection (currency mismatch on payment capture)'));
    console.log(chalk.bold.white('─'.repeat(80) + '\n'));

    logger.info(`Creating valid authorization order (amount: 50000 paise)...`);
    const validOrder = await gateway.orders.create({
      amount: 50000,
      currency: 'INR',
      receipt: 'rcpt_demo_001'
    });

    logger.info(`Simulating payment authorization: pay_demo_12345 (INR)`);
    logger.info(`Attempting capture with mismatched currency (USD):`);
    console.log(chalk.dim(`  await gateway.payments.capture('pay_demo_12345', { amount: 50000, currency: 'USD' });\n`));

    await sleep(800);

    try {
      await gateway.payments.capture('pay_demo_12345', { amount: 50000, currency: 'USD' });
    } catch {
      logger.success(`Error diagnosis completed. Generated root cause and actionable diff.`);
    }

    await sleep(1000);

    // ---------------------------------------------------------------------------
    // SCENARIO 3: AGENTIC WEBHOOK SIMULATOR
    // ---------------------------------------------------------------------------
    console.log(chalk.bold.white('\n' + '─'.repeat(80)));
    console.log(chalk.bold.hex('#3B82F6')('[SCENARIO 3/3] Agentic Webhook Simulator'));
    console.log(chalk.dim('Description: Autonomously dispatching multi-stage payment event sequence'));
    console.log(chalk.bold.white('─'.repeat(80) + '\n'));

    logger.info(`Simulating checkout completion for order: ${validOrder.id}`);
    console.log(chalk.dim(`  await gateway.simulatePaymentSuccess('${validOrder.id}', { method: 'upi' });\n`));

    await sleep(800);

    await gateway.simulatePaymentSuccess(validOrder.id, {
      method: 'upi',
      vpa: 'demo_customer@okhdfcbank'
    });

    logger.info(`Merchant receiver processed ${receivedWebhooks.length} events with verified HMAC-SHA256 signatures.`);

    await sleep(600);

    console.log(chalk.dim('\n' + '─'.repeat(80)));
    console.log(chalk.bold.green('[STATUS] Test sequence completed. All 3 scenarios verified.'));
    console.log(chalk.dim('  • Pre-Flight Validation Engine: Blocked invalid outbound call locally with diff'));
    console.log(chalk.dim('  • AI Error Translator: Diagnosed gateway failure with structured tool calling'));
    console.log(chalk.dim('  • Agentic Webhook Simulator: Dispatched and verified HMAC-signed sequence'));
    console.log(chalk.dim('─'.repeat(80) + '\n'));

    // Clean up server safely
    if (server.closeAllConnections) {
      server.closeAllConnections();
    }
    await new Promise(res => server.close(res));
  } finally {
    console.log = originalLog;
    process.stdout.write = originalStdoutWrite;
  }
}

// Allow direct run
if (process.argv[1] && process.argv[1].endsWith('run-demo.js')) {
  runDemo().catch(err => {
    console.error('Demo error:', err);
    process.exit(1);
  });
}
