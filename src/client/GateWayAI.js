import crypto from 'crypto';
import { RulesEngine, PreflightValidationError } from '../rules/engine.js';
import { standardRules } from '../rules/rules.js';
import { MockGateway } from '../mock/gateway.js';
import { AiErrorTranslator } from '../ai/translator.js';
import { WebhookSimulator, signPayload } from '../webhooks/simulator.js';
import { defaultStore } from '../storage/store.js';
import { logger } from '../ui/logger.js';

export class GateWayAI {
  constructor(config = {}) {
    this.key_id = config.key_id || process.env.RAZORPAY_KEY_ID || 'rzp_test_gatewayai_demo';
    this.key_secret = config.key_secret || process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_123';
    this.webhook_secret = config.webhook_secret || process.env.GATEWAY_WEBHOOK_SECRET || 'gateway_ai_secret_xyz123';
    this.webhook_url = config.webhook_url || process.env.GATEWAY_WEBHOOK_URL || 'http://localhost:3000/webhook';
    this.gemini_api_key = config.gemini_api_key || process.env.GEMINI_API_KEY;

    this.store = config.store || defaultStore;

    // 1. Initialize Rules Engine with built-in rules
    this.rulesEngine = new RulesEngine();
    standardRules.forEach(rule => this.rulesEngine.register(rule));

    // 2. Initialize Mock Gateway
    this.mockGateway = new MockGateway(this.store);

    // 3. Initialize AI Error Translator
    this.translator = new AiErrorTranslator(this.gemini_api_key);

    // 4. Initialize Webhook Simulator
    this.webhookSimulator = new WebhookSimulator({
      webhookUrl: this.webhook_url,
      webhookSecret: this.webhook_secret,
      store: this.store
    });

    // Scaffolding sub-namespaces matching Razorpay Node SDK
    this.orders = {
      create: (payload, options) => this._createOrder(payload, options),
      fetch: (orderId) => this.mockGateway.fetchOrder(orderId)
    };

    this.payments = {
      capture: (paymentId, captureData, options) => this._capturePayment(paymentId, captureData, options),
      fetch: async (paymentId) => {
        const p = this.store.find('payments', pay => pay.id === paymentId);
        if (!p) throw new Error(`Payment ${paymentId} not found`);
        return p;
      }
    };
  }

  /**
   * Extensible: Register custom pre-flight rules at runtime
   */
  registerRule(rule) {
    this.rulesEngine.register(rule);
    return this;
  }

  getRules() {
    return this.rulesEngine.getRules();
  }

  /**
   * Helper to verify Razorpay webhook signatures in merchant endpoints
   */
  verifyWebhookSignature(rawBody, signature, secret = this.webhook_secret) {
    const expected = signPayload(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), secret);
    return expected === signature;
  }

  /**
   * Internal Order Creation with Pre-Flight Interception and AI Error Translation
   */
  async _createOrder(payload, options = {}) {
    logger.gateway(`Intercepted outbound orders.create call.`);

    // 1. Feature 1: Pre-Flight Validation Interception
    this.rulesEngine.assert('orders.create', payload);

    // 2. Forward to Mock Gateway
    try {
      const order = await this.mockGateway.createOrder(payload, options);
      logger.success(`Order created successfully: ${order.id} (Amount: ₹${(order.amount / 100).toFixed(2)})`);
      return order;
    } catch (err) {
      // 3. Feature 2: AI Error Translation
      logger.error(`Gateway error encountered on orders.create: ${err.message}`);
      await this.translator.diagnose({
        error: err,
        method: 'orders.create',
        requestPayload: payload,
        endpoint: '/v1/orders'
      });
      throw err;
    }
  }

  /**
   * Internal Payment Capture with Pre-Flight Interception and AI Error Translation
   */
  async _capturePayment(paymentId, captureData = {}, options = {}) {
    logger.gateway(`Intercepted outbound payments.capture call for payment: ${paymentId}`);

    // 1. Pre-Flight check
    this.rulesEngine.assert('payments.capture', captureData);

    // 2. Forward to Mock Gateway
    try {
      const payment = await this.mockGateway.capturePayment(paymentId, captureData, options);
      logger.success(`Payment captured successfully: ${payment.id}`);
      return payment;
    } catch (err) {
      // 3. Feature 2: AI Error Translation
      logger.error(`Gateway error encountered on payments.capture: ${err.message}`);
      await this.translator.diagnose({
        error: err,
        method: 'payments.capture',
        requestPayload: captureData,
        endpoint: `/v1/payments/${paymentId}/capture`
      });
      throw err;
    }
  }

  /**
   * Feature 3: Agentic Webhook Simulation
   * Autonomously simulates customer checkout success and delivers sequence to local webhook endpoint
   */
  async simulatePaymentSuccess(orderId, paymentDetails = {}) {
    logger.gateway(`Simulating customer checkout success for order: ${orderId}`);
    const order = await this.orders.fetch(orderId);
    const payment = await this.mockGateway.simulatePayment(orderId, {
      ...paymentDetails,
      status: 'authorized'
    });

    // Autonomous multi-stage webhook delivery
    const webhookDeliveries = await this.webhookSimulator.fireSuccessLifecycle(order, payment);
    return { order, payment, webhooks: webhookDeliveries };
  }

  /**
   * Feature 3: Agentic Webhook Simulation for Payment Failure
   */
  async simulatePaymentFailure(orderId, paymentDetails = {}, reason = 'card_declined') {
    logger.gateway(`Simulating customer payment failure for order: ${orderId}`);
    const order = await this.orders.fetch(orderId);
    const payment = await this.mockGateway.simulatePayment(orderId, {
      ...paymentDetails,
      status: 'failed'
    });

    const webhookDeliveries = await this.webhookSimulator.fireFailureLifecycle(order, payment, reason);
    return { order, payment, webhooks: webhookDeliveries };
  }
}

export { PreflightValidationError };
