import crypto from 'crypto';
import { defaultStore } from '../storage/store.js';

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export class MockGateway {
  constructor(store = defaultStore) {
    this.store = store;
  }

  /**
   * Create an Order (POST /v1/orders)
   */
  async createOrder(payload, options = {}) {
    // Check for simulated gateway errors
    if (options.simulateError === 'duplicate_receipt') {
      const err = new Error('Order with this receipt ID already exists');
      err.statusCode = 400;
      err.response = {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Order with this receipt ID already exists',
          field: 'receipt',
          source: 'business',
          step: 'order_creation',
          reason: 'duplicate_receipt',
          metadata: { receipt: payload.receipt || null }
        }
      };
      throw err;
    }

    const orderId = generateId('order');
    const timestamp = Math.floor(Date.now() / 1000);

    const order = {
      id: orderId,
      entity: 'order',
      amount: payload.amount,
      amount_paid: 0,
      amount_due: payload.amount,
      currency: payload.currency || 'INR',
      receipt: payload.receipt || null,
      offer_id: null,
      status: 'created',
      attempts: 0,
      notes: payload.notes || {},
      created_at: timestamp
    };

    this.store.append('orders', order);
    return order;
  }

  /**
   * Fetch an Order (GET /v1/orders/:id)
   */
  async fetchOrder(orderId) {
    const order = this.store.find('orders', o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order ${orderId} not found`);
      err.statusCode = 404;
      err.response = {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The requested order id does not exist',
          field: 'order_id',
          source: 'business',
          step: 'order_fetch',
          reason: 'entity_not_found',
          metadata: { order_id: orderId }
        }
      };
      throw err;
    }
    return order;
  }

  /**
   * Capture a Payment (POST /v1/payments/:id/capture)
   */
  async capturePayment(paymentId, captureData = {}, options = {}) {
    // Check if error simulation requested
    if (options.simulateError === 'currency_mismatch' || captureData.currency === 'USD') {
      const err = new Error('Payment currency mismatch');
      err.statusCode = 400;
      err.response = {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: `Payment currency (${captureData.currency || 'USD'}) does not match the original order currency (INR)`,
          field: 'currency',
          source: 'business',
          step: 'payment_capture',
          reason: 'currency_mismatch',
          metadata: {
            payment_id: paymentId,
            order_id: 'order_demo_101',
            requested_currency: captureData.currency || 'USD',
            order_currency: 'INR'
          }
        }
      };
      throw err;
    }

    if (options.simulateError === 'already_captured') {
      const err = new Error('Payment already captured');
      err.statusCode = 400;
      err.response = {
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'This payment has already been captured and cannot be captured again',
          field: null,
          source: 'business',
          step: 'payment_capture',
          reason: 'payment_already_captured',
          metadata: { payment_id: paymentId, order_id: 'order_demo_102' }
        }
      };
      throw err;
    }

    const payment = this.store.find('payments', p => p.id === paymentId) || {
      id: paymentId,
      entity: 'payment',
      amount: captureData.amount || 50000,
      currency: captureData.currency || 'INR',
      status: 'authorized',
      order_id: generateId('order')
    };

    payment.status = 'captured';
    payment.captured = true;
    this.store.update('payments', p => p.id === paymentId, payment);

    return payment;
  }

  /**
   * Simulate a customer payment flow for an order
   */
  async simulatePayment(orderId, paymentDetails = {}) {
    const order = await this.fetchOrder(orderId);
    const paymentId = generateId('pay');
    const timestamp = Math.floor(Date.now() / 1000);

    const payment = {
      id: paymentId,
      entity: 'payment',
      amount: order.amount,
      currency: order.currency,
      status: paymentDetails.status || 'authorized',
      order_id: orderId,
      invoice_id: null,
      international: false,
      method: paymentDetails.method || 'upi',
      amount_refunded: 0,
      refund_status: null,
      captured: paymentDetails.status === 'captured',
      description: `Payment for order ${orderId}`,
      card_id: null,
      bank: null,
      wallet: null,
      vpa: paymentDetails.vpa || 'customer@okhdfcbank',
      email: paymentDetails.email || 'customer@example.com',
      contact: paymentDetails.contact || '+919876543210',
      notes: order.notes,
      fee: Math.round(order.amount * 0.02), // 2% gateway fee
      tax: Math.round(order.amount * 0.02 * 0.18), // 18% GST on fee
      error_code: null,
      error_description: null,
      created_at: timestamp
    };

    this.store.append('payments', payment);
    return payment;
  }
}
