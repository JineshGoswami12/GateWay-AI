/**
 * Deterministic offline fallback translator for payment gateway errors.
 * Ensures the developer tool works even without internet or missing API keys.
 */

export function getDeterministicDiagnosis({ error, method, requestPayload }) {
  const code = error?.code || 'GATEWAY_ERROR';
  const reason = error?.reason || error?.description || '';

  if (reason.includes('currency_mismatch') || reason.includes('currency')) {
    return {
      explanation: "The payment capture call specified a different currency than the original order authorization.",
      rootCause: "Razorpay requires payment capture requests to either match the authorized currency exactly or omit the currency parameter to capture the full authorized amount.",
      codeFix: `// Option A: Pass matching currency\n- await razorpay.payments.capture(paymentId, { amount: 50000, currency: "USD" });\n+ await razorpay.payments.capture(paymentId, { amount: 50000, currency: "INR" });\n\n// Option B: Omit currency to inherit authorized currency\n+ await razorpay.payments.capture(paymentId, { amount: 50000 });`,
      suggestedAction: "Check your order creation currency before capturing, or omit the currency argument.",
      documentationLink: "https://razorpay.com/docs/api/payments/capture/#capture-a-payment",
      proposedRule: {
        id: 'CAPTURE_CURRENCY_NOT_ALLOWED',
        method: 'payments.capture',
        description: 'Payment capture requests must not specify a mismatched currency (USD). Omit currency or match the authorized order.',
        field: 'currency',
        condition: 'disallowed',
        targetValue: 'USD',
        fixSuggestion: '- await razorpay.payments.capture(paymentId, { amount: 50000, currency: "USD" });\n+ await razorpay.payments.capture(paymentId, { amount: 50000 }); // Omit currency'
      }
    };
  }

  if (reason.includes('already_captured') || code.includes('ALREADY_CAPTURED')) {
    return {
      explanation: "Attempted to capture a payment that has already been captured.",
      rootCause: "Payment capture is an idempotent, one-time operation. If auto-capture was enabled on the order (payment_capture: 1), manual capture calls will fail.",
      codeFix: `// Check if payment is already captured before calling capture:\nconst payment = await razorpay.payments.fetch(paymentId);\nif (payment.status === 'authorized') {\n+  await razorpay.payments.capture(paymentId, { amount });\n} else {\n+  console.log('Payment already captured:', payment.status);\n}`,
      suggestedAction: "Verify payment.status is 'authorized' before calling payments.capture.",
      documentationLink: "https://razorpay.com/docs/api/payments/#payment-states"
    };
  }

  if (reason.includes('duplicate_receipt')) {
    return {
      explanation: "An order with this receipt number was already created.",
      rootCause: "Receipt IDs act as idempotency keys. Reusing a receipt ID within the active window causes a duplicate rejection.",
      codeFix: `// Ensure receipt ID is unique per order:\n- receipt: "order_receipt_123"\n+ receipt: \`rcpt_\${Date.now()}_\${Math.random().toString(36).slice(2, 7)}\``,
      suggestedAction: "Generate dynamic or UUID-based receipt identifiers for each checkout session.",
      documentationLink: "https://razorpay.com/docs/api/orders/#create-an-order",
      proposedRule: {
        id: 'RECEIPT_IDEMPOTENCY_UNIQUE',
        method: 'orders.create',
        description: 'Static or known duplicate receipt ID detected. Generate dynamic unique identifiers for each order session.',
        field: 'receipt',
        condition: 'disallowed',
        targetValue: 'rcpt_campaign_duplicate_001',
        fixSuggestion: '- receipt: "rcpt_campaign_duplicate_001"\n+ receipt: `rcpt_${Date.now()}`'
      }
    };
  }

  // General fallback
  return {
    explanation: `Payment gateway rejected the ${method || 'API'} call with code ${code}.`,
    rootCause: `Gateway error: "${error?.description || 'Unknown error'}" in step "${error?.step || 'unknown'}".`,
    codeFix: `// Inspect payload and verify fields against API specs:\nconsole.log('Request Payload:', ${JSON.stringify(requestPayload || {})});`,
    suggestedAction: "Review gateway error parameters and verify merchant account permissions.",
    documentationLink: "https://razorpay.com/docs/api/errors/"
  };
}
