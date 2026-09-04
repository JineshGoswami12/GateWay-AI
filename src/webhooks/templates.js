import crypto from 'crypto';

export function createEventId() {
  return `evt_${crypto.randomBytes(8).toString('hex')}`;
}

export function buildPaymentAuthorizedPayload(payment) {
  return {
    entity: 'event',
    account_id: 'acc_GateWayAI_Dev',
    event: 'payment.authorized',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          ...payment,
          status: 'authorized',
          captured: false
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };
}

export function buildOrderPaidPayload(order, payment) {
  return {
    entity: 'event',
    account_id: 'acc_GateWayAI_Dev',
    event: 'order.paid',
    contains: ['payment', 'order'],
    payload: {
      payment: {
        entity: {
          ...payment,
          status: 'authorized'
        }
      },
      order: {
        entity: {
          ...order,
          amount_paid: order.amount,
          amount_due: 0,
          status: 'paid',
          attempts: (order.attempts || 0) + 1
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };
}

export function buildPaymentCapturedPayload(payment) {
  return {
    entity: 'event',
    account_id: 'acc_GateWayAI_Dev',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          ...payment,
          status: 'captured',
          captured: true
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };
}

export function buildPaymentFailedPayload(payment, reason = 'card_declined') {
  return {
    entity: 'event',
    account_id: 'acc_GateWayAI_Dev',
    event: 'payment.failed',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          ...payment,
          status: 'failed',
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'Payment was declined by the customer issuing bank',
          error_source: 'issuing_bank',
          error_step: 'payment_authorization',
          error_reason: reason
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };
}
