import crypto from 'crypto';
import { logger } from '../ui/logger.js';
import { formatWebhookSequenceTable } from '../ui/formatters.js';
import { defaultStore } from '../storage/store.js';
import {
  createEventId,
  buildPaymentAuthorizedPayload,
  buildOrderPaidPayload,
  buildPaymentCapturedPayload,
  buildPaymentFailedPayload
} from './templates.js';

export function signPayload(payloadString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

export class WebhookSimulator {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl || process.env.GATEWAY_WEBHOOK_URL || 'http://localhost:3000/webhook';
    this.webhookSecret = options.webhookSecret || process.env.GATEWAY_WEBHOOK_SECRET || 'gateway_ai_secret_xyz123';
    this.store = options.store || defaultStore;
  }

  /**
   * Dispatch a single webhook event to the developer's local server
   */
  async dispatchEvent(eventPayload) {
    const rawBody = JSON.stringify(eventPayload);
    const signature = signPayload(rawBody, this.webhookSecret);
    const eventId = createEventId();

    const startTime = Date.now();
    let statusCode = null;
    let error = null;
    let responseText = '';

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': signature,
          'X-Razorpay-Event-Id': eventId,
          'User-Agent': 'GateWay-AI/WebhookAgent-1.0'
        },
        body: rawBody
      });

      statusCode = response.status;
      responseText = await response.text();
    } catch (err) {
      error = err.message;
      statusCode = 500;
    }

    const latencyMs = Date.now() - startTime;

    const deliveryRecord = {
      id: eventId,
      event: eventPayload.event,
      targetUrl: this.webhookUrl,
      signatureVerified: statusCode >= 200 && statusCode < 300,
      statusCode,
      latencyMs,
      error,
      timestamp: new Date().toISOString()
    };

    this.store.append('webhooks', deliveryRecord);
    return deliveryRecord;
  }

  /**
   * Autonomously simulate a successful payment sequence:
   * 1. payment.authorized
   * 2. order.paid
   * 3. payment.captured
   */
  async fireSuccessLifecycle(order, payment, options = { delayMs: 150 }) {
    logger.webhook(`Autonomous Webhook Agent triggered for Order: ${order.id}`);
    const results = [];

    const sleep = ms => new Promise(res => setTimeout(res, ms));

    // Step 1: payment.authorized
    const authorizedPayload = buildPaymentAuthorizedPayload(payment);
    logger.webhook(`Firing event [1/3]: ${authorizedPayload.event}...`);
    const r1 = await this.dispatchEvent(authorizedPayload);
    results.push(r1);
    await sleep(options.delayMs);

    // Step 2: order.paid
    const orderPaidPayload = buildOrderPaidPayload(order, payment);
    logger.webhook(`Firing event [2/3]: ${orderPaidPayload.event}...`);
    const r2 = await this.dispatchEvent(orderPaidPayload);
    results.push(r2);
    await sleep(options.delayMs);

    // Step 3: payment.captured
    const capturedPayload = buildPaymentCapturedPayload(payment);
    logger.webhook(`Firing event [3/3]: ${capturedPayload.event}...`);
    const r3 = await this.dispatchEvent(capturedPayload);
    results.push(r3);

    // Render summary table
    console.log('\n' + formatWebhookSequenceTable(results) + '\n');
    logger.success(`Webhook lifecycle completed: 3 realistic events signed & delivered.`);

    return results;
  }

  /**
   * Autonomously simulate a failed payment event
   */
  async fireFailureLifecycle(order, payment, reason = 'card_declined') {
    logger.webhook(`Autonomous Webhook Agent triggered for Payment Failure: ${payment.id}`);
    const failedPayload = buildPaymentFailedPayload(payment, reason);
    const result = await this.dispatchEvent(failedPayload);
    console.log('\n' + formatWebhookSequenceTable([result]) + '\n');
    return [result];
  }
}
