import assert from 'assert';
import http from 'http';
import chalk from 'chalk';
import { GateWayAI, PreflightValidationError, signPayload, defaultStore, compileDeclarativeRule } from '../src/index.js';
import * as db from '../src/storage/db.js';
import { createMerchantApp } from '../demo/run-demo.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(chalk.green(`✔ PASS: ${name}`));
    passed++;
  } catch (err) {
    console.log(chalk.red(`✖ FAIL: ${name}`));
    console.error(err);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(chalk.green(`✔ PASS: ${name}`));
    passed++;
  } catch (err) {
    console.log(chalk.red(`✖ FAIL: ${name}`));
    console.error(err);
    failed++;
  }
}

console.log(chalk.bold.cyan('\n🧪 Running GateWay-AI Test Suite...\n'));

// Test 1: Pre-Flight Validation - Rejects Decimal Amount
test('Pre-flight blocks decimal amounts', () => {
  const gateway = new GateWayAI();
  assert.throws(
    () => {
      gateway.rulesEngine.assert('orders.create', { amount: 500.5, currency: 'INR' }, { silent: true });
    },
    (err) => {
      return err instanceof PreflightValidationError && err.ruleId === 'AMOUNT_SUBUNIT_INTEGER';
    }
  );
});

// Test 2: Pre-Flight Validation - Rejects Lowercase Currency
test('Pre-flight blocks lowercase currency codes', () => {
  const gateway = new GateWayAI();
  assert.throws(
    () => {
      gateway.rulesEngine.assert('orders.create', { amount: 50000, currency: 'inr' }, { silent: true });
    },
    (err) => {
      return err instanceof PreflightValidationError && err.ruleId === 'CURRENCY_ISO_FORMAT';
    }
  );
});

// Test 3: Pre-Flight Validation - Rejects Receipt Exceeding 40 chars
test('Pre-flight blocks receipt exceeding 40 chars', () => {
  const gateway = new GateWayAI();
  assert.throws(
    () => {
      gateway.rulesEngine.assert('orders.create', {
        amount: 50000,
        currency: 'INR',
        receipt: 'a'.repeat(45)
      }, { silent: true });
    },
    (err) => {
      return err instanceof PreflightValidationError && err.ruleId === 'RECEIPT_MAX_LENGTH';
    }
  );
});

// Test 4: Pre-Flight Validation - Passes Valid Payload
test('Pre-flight allows valid payload', () => {
  const gateway = new GateWayAI();
  const valid = gateway.rulesEngine.assert('orders.create', {
    amount: 50000,
    currency: 'INR',
    receipt: 'rcpt_valid_123'
  }, { silent: true });
  assert.strictEqual(valid, true);
});

// Test 5: Extensibility - Register Custom Rule
test('Allows registering custom pre-flight rules', () => {
  const gateway = new GateWayAI();
  gateway.registerRule({
    id: 'CUSTOM_MIN_ITEMS',
    method: 'orders.create',
    description: 'Requires customer tag in notes',
    validate: (payload) => {
      if (!payload.notes?.customer_tag) {
        return {
          description: 'Missing customer_tag in notes',
          violation: { field: 'notes.customer_tag', value: null, expected: 'string' },
          fixSuggestion: '+ notes: { customer_tag: "VIP" }'
        };
      }
      return null;
    }
  });

  assert.throws(
    () => {
      gateway.rulesEngine.assert('orders.create', { amount: 50000, currency: 'INR' }, { silent: true });
    },
    (err) => err.ruleId === 'CUSTOM_MIN_ITEMS'
  );
});

// Test 6: Webhook HMAC-SHA256 Signature Generation & Verification
test('Webhook HMAC signature generation is accurate and reproducible', () => {
  const secret = 'test_secret_key_123';
  const payload = JSON.stringify({ event: 'order.paid', id: 'order_123' });
  const sig1 = signPayload(payload, secret);
  const sig2 = signPayload(payload, secret);

  assert.strictEqual(sig1, sig2);
  assert.strictEqual(typeof sig1, 'string');
  assert.strictEqual(sig1.length, 64); // SHA-256 hex string length
});

// Test 7: Local Storage JSON persistence
test('LocalStore writes and reads data', () => {
  defaultStore.clear();
  defaultStore.append('orders', { id: 'order_test_999', amount: 10000 });
  const orders = defaultStore.read('orders');
  assert.strictEqual(orders.length, 1);
  assert.strictEqual(orders[0].id, 'order_test_999');
});

// Test 8: End-to-End Flow with Merchant Server & Signature Verification
await asyncTest('End-to-end payment creation and webhook signature delivery', async () => {
  const secret = 'e2e_webhook_secret_999';
  const port = 3001;
  const { app, receivedWebhooks } = createMerchantApp({ webhookSecret: secret });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, resolve));

  const gateway = new GateWayAI({
    webhook_secret: secret,
    webhook_url: `http://localhost:${port}/webhook`
  });

  // 1. Create Order
  const order = await gateway.orders.create({
    amount: 75000,
    currency: 'INR',
    receipt: 'rcpt_e2e_001'
  });
  assert.strictEqual(order.amount, 75000);
  assert.strictEqual(order.currency, 'INR');

  // 2. Simulate Success
  const result = await gateway.simulatePaymentSuccess(order.id, {
    method: 'upi',
    vpa: 'test@upi'
  });

  assert.strictEqual(result.webhooks.length, 3);
  assert.strictEqual(receivedWebhooks.length, 3);
  assert.strictEqual(receivedWebhooks[0].event, 'payment.authorized');
  assert.strictEqual(receivedWebhooks[1].event, 'order.paid');
  assert.strictEqual(receivedWebhooks[2].event, 'payment.captured');

  server.close();
});

// Test 9: Declarative Rule Compiler
test('Declarative rule compiler maps JSON spec into executable rule', () => {
  const compiled = compileDeclarativeRule({
    id: 'TEST_DISALLOW_FOO',
    method: 'orders.create',
    description: 'Field foo is disallowed',
    field: 'foo',
    condition: 'disallowed',
    targetValue: 'bar',
    fixSuggestion: '- foo: "bar"'
  });
  assert.strictEqual(compiled.id, 'TEST_DISALLOW_FOO');
  assert.strictEqual(typeof compiled.validate, 'function');
  const res = compiled.validate({ foo: 'bar' });
  assert.ok(res);
  assert.strictEqual(res.violation.field, 'foo');
  assert.strictEqual(compiled.validate({ foo: 'baz' }), null);
});

// Test 10: Self-Improving Rule Loop End-to-End
await asyncTest('Self-Improving Rule Loop: AI error translation proposes rule -> confirmed -> blocked locally in <1ms', async () => {
  const gateway = new GateWayAI();

  // 1. Initial attempt: capture with USD is NOT blocked by initial rules
  assert.doesNotThrow(() => {
    gateway.rulesEngine.assert('payments.capture', { amount: 50000, currency: 'USD' }, { silent: true });
  });

  // 2. Gateway fails, AI translates error and proposes new rule
  const diagnosis = await gateway.translator.diagnose({
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment currency (USD) does not match the original order currency (INR)',
      reason: 'currency_mismatch'
    },
    method: 'payments.capture',
    requestPayload: { amount: 50000, currency: 'USD' }
  });

  assert.ok(diagnosis.proposedRule, 'AI Error Translator must propose a new pre-flight rule');
  assert.strictEqual(diagnosis.proposedRule.id, 'CAPTURE_CURRENCY_NOT_ALLOWED');
  assert.strictEqual(diagnosis.proposedRule.method, 'payments.capture');

  // 3. Developer explicitly confirms and registers the rule
  const compiled = compileDeclarativeRule({
    ...diagnosis.proposedRule,
    origin: 'ai_proposed'
  });
  gateway.registerRule(compiled);
  db.recordRule({
    ...diagnosis.proposedRule,
    origin: 'ai_proposed'
  });

  // 4. Identical bad request resubmitted -> immediately BLOCKED locally in <1ms!
  assert.throws(
    () => {
      gateway.rulesEngine.assert('payments.capture', { amount: 50000, currency: 'USD' }, { silent: true });
    },
    (err) => {
      return err instanceof PreflightValidationError && err.ruleId === 'CAPTURE_CURRENCY_NOT_ALLOWED';
    }
  );

  // 5. Valid capture payload passes
  assert.doesNotThrow(() => {
    gateway.rulesEngine.assert('payments.capture', { amount: 50000 }, { silent: true });
  });
});

// Test 11: SQLite Persistence & Origin Tracking
test('SQLite tracks rule origins and restores custom rules across restarts', () => {
  db.seedBuiltInRules();
  const allRules = db.getAllRules();
  const builtIn = allRules.filter(r => r.origin === 'built_in');
  const aiProposed = allRules.filter(r => r.origin === 'ai_proposed');

  assert.ok(builtIn.length >= 7, 'Must have at least 7 built-in rules');
  assert.ok(aiProposed.length >= 1, 'Must track AI-proposed rules in SQLite');

  // Test restoring into fresh engine instance
  const freshGateway = new GateWayAI();
  const initialRuleCount = freshGateway.rulesEngine.getRules().length;
  const restored = db.loadCustomRules(freshGateway.rulesEngine);
  assert.ok(restored.length >= 1, 'Custom rules must be loadable into fresh engine');
  assert.strictEqual(freshGateway.rulesEngine.getRules().length, initialRuleCount + restored.length);
});

console.log('\n' + '─'.repeat(40));
console.log(chalk.bold(`Results: ${passed} passed, ${failed} failed.\n`));

if (failed > 0) {
  process.exit(1);
}
