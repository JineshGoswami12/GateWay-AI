/**
 * Built-in Pre-Flight Validation Rules for Payment APIs (Razorpay-style)
 */

export const standardRules = [
  // 1. Amount must be an integer subunit (paise/cents)
  {
    id: 'AMOUNT_SUBUNIT_INTEGER',
    method: 'orders.create',
    description: 'Amount must be an integer represented in the currency subunit (e.g. paise for INR, cents for USD). Floats and strings are rejected.',
    validate: (payload) => {
      if (payload.amount === undefined || payload.amount === null) {
        return {
          description: 'Amount is required for creating an order.',
          violation: { field: 'amount', value: payload.amount, expected: 'Integer in paise (e.g. 50000 for ₹500)' },
          fixSuggestion: `- amount: undefined\n+ amount: 50000 // ₹500 in paise`
        };
      }

      if (typeof payload.amount === 'string') {
        const parsed = Number(payload.amount);
        return {
          description: 'Amount must be a numeric integer, not a string.',
          violation: { field: 'amount', value: payload.amount, expected: 'number (integer)' },
          fixSuggestion: `- amount: "${payload.amount}"\n+ amount: ${isNaN(parsed) ? 50000 : Math.round(parsed * 100)}`
        };
      }

      if (!Number.isInteger(payload.amount)) {
        const paise = Math.round(payload.amount * 100);
        return {
          description: `Amount has decimals (${payload.amount}). Payment gateways expect the lowest denomination (paise for INR).`,
          violation: { field: 'amount', value: payload.amount, expected: `Integer paise (${paise})` },
          fixSuggestion: `- amount: ${payload.amount}\n+ amount: ${paise} // (${payload.amount} * 100 in paise)`
        };
      }

      return null;
    }
  },

  // 2. Minimum amount check
  {
    id: 'AMOUNT_MINIMUM_THRESHOLD',
    method: 'orders.create',
    description: 'Amount must be at least 100 subunits (e.g., ₹1.00 = 100 paise).',
    validate: (payload) => {
      if (typeof payload.amount === 'number' && payload.amount < 100) {
        return {
          description: `Amount of ${payload.amount} is below the minimum transaction threshold of 100 paise (₹1.00).`,
          violation: { field: 'amount', value: payload.amount, expected: '>= 100 paise (₹1.00)' },
          fixSuggestion: `- amount: ${payload.amount}\n+ amount: 100 // minimum 100 paise`
        };
      }
      return null;
    }
  },

  // 3. Currency code formatting (ISO-4217 uppercase)
  {
    id: 'CURRENCY_ISO_FORMAT',
    method: 'orders.create',
    description: 'Currency must be an uppercase 3-letter ISO-4217 code (e.g., "INR", "USD", "EUR").',
    validate: (payload) => {
      if (!payload.currency) {
        return {
          description: 'Currency is required.',
          violation: { field: 'currency', value: payload.currency, expected: '"INR" (or ISO code)' },
          fixSuggestion: `+ currency: "INR"`
        };
      }

      if (typeof payload.currency !== 'string' || payload.currency !== payload.currency.toUpperCase()) {
        const fixed = String(payload.currency).toUpperCase();
        return {
          description: `Currency "${payload.currency}" must be uppercase 3-letter ISO string.`,
          violation: { field: 'currency', value: payload.currency, expected: fixed },
          fixSuggestion: `- currency: "${payload.currency}"\n+ currency: "${fixed}"`
        };
      }

      const validCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'CAD', 'AUD', 'MYR'];
      if (!validCurrencies.includes(payload.currency)) {
        return {
          description: `Unsupported currency code "${payload.currency}".`,
          violation: { field: 'currency', value: payload.currency, expected: `One of: ${validCurrencies.join(', ')}` },
          fixSuggestion: `- currency: "${payload.currency}"\n+ currency: "INR"`
        };
      }

      return null;
    }
  },

  // 4. Receipt length limitation (strict 40 chars in Razorpay)
  {
    id: 'RECEIPT_MAX_LENGTH',
    method: 'orders.create',
    description: 'Receipt ID must not exceed 40 characters.',
    validate: (payload) => {
      if (payload.receipt && typeof payload.receipt === 'string' && payload.receipt.length > 40) {
        const truncated = payload.receipt.slice(0, 36) + '_rcp';
        return {
          description: `Receipt identifier length (${payload.receipt.length} chars) exceeds Razorpay's 40-character limit.`,
          violation: { field: 'receipt', value: payload.receipt, expected: 'string (<= 40 characters)' },
          fixSuggestion: `- receipt: "${payload.receipt}"\n+ receipt: "${truncated}" // max 40 chars`
        };
      }
      return null;
    }
  },

  // 5. Notes dictionary limits (max 15 key-value pairs, key <= 30 chars, value <= 256 chars)
  {
    id: 'NOTES_CONSTRAINTS',
    method: 'orders.create',
    description: 'Notes must not exceed 15 key-value pairs. Keys <= 30 chars, values <= 256 chars.',
    validate: (payload) => {
      if (!payload.notes) return null;

      if (typeof payload.notes !== 'object' || Array.isArray(payload.notes)) {
        return {
          description: 'Notes must be an object of key-value pairs.',
          violation: { field: 'notes', value: payload.notes, expected: 'Object with key-value pairs' },
          fixSuggestion: `- notes: ${JSON.stringify(payload.notes)}\n+ notes: { order_ref: "cart_123" }`
        };
      }

      const entries = Object.entries(payload.notes);
      if (entries.length > 15) {
        return {
          description: `Notes object contains ${entries.length} keys, exceeding the maximum limit of 15 keys.`,
          violation: { field: 'notes', value: `${entries.length} keys`, expected: '<= 15 keys' },
          fixSuggestion: `// Reduce custom notes to 15 or fewer key-value pairs`
        };
      }

      for (const [k, v] of entries) {
        if (k.length > 30) {
          return {
            description: `Note key "${k}" exceeds 30 characters (${k.length} chars).`,
            violation: { field: `notes.${k}`, value: k, expected: '<= 30 characters' },
            fixSuggestion: `- "${k}": ...\n+ "${k.slice(0, 30)}": ...`
          };
        }
        if (typeof v === 'string' && v.length > 256) {
          return {
            description: `Note value for "${k}" exceeds 256 characters (${v.length} chars).`,
            violation: { field: `notes.${k}`, value: `${v.slice(0, 40)}...`, expected: '<= 256 characters' },
            fixSuggestion: `// Truncate note value to 256 characters`
          };
        }
      }

      return null;
    }
  },

  // 6. Payment capture parameter
  {
    id: 'PAYMENT_CAPTURE_BOOLEAN',
    method: 'orders.create',
    description: 'payment_capture must be a binary flag: 1 (auto-capture), 0 (manual capture), or boolean.',
    validate: (payload) => {
      if (payload.payment_capture !== undefined) {
        const val = payload.payment_capture;
        if (val !== 0 && val !== 1 && val !== true && val !== false) {
          return {
            description: `Invalid payment_capture value (${JSON.stringify(val)}). Must be 1, 0, true, or false.`,
            violation: { field: 'payment_capture', value: val, expected: '1 | 0 | true | false' },
            fixSuggestion: `- payment_capture: ${JSON.stringify(val)}\n+ payment_capture: 1 // 1 for auto-capture, 0 for manual capture`
          };
        }
      }
      return null;
    }
  },

  // 7. Payment capture method rules
  {
    id: 'PAYMENT_CAPTURE_AMOUNT',
    method: 'payments.capture',
    description: 'Payment capture requires an integer amount.',
    validate: (payload) => {
      if (!payload.amount || !Number.isInteger(payload.amount)) {
        return {
          description: 'Payment capture requires an integer subunit amount.',
          violation: { field: 'amount', value: payload.amount, expected: 'Integer in paise' },
          fixSuggestion: `- amount: ${payload.amount}\n+ amount: 50000`
        };
      }
      return null;
    }
  }
];
