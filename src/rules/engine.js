import { formatPreflightBlock } from '../ui/formatters.js';
import { logger } from '../ui/logger.js';

export class PreflightValidationError extends Error {
  constructor(method, violation) {
    super(`[Pre-Flight Validation Blocked] ${violation.description}`);
    this.name = 'PreflightValidationError';
    this.method = method;
    this.ruleId = violation.ruleId;
    this.violation = violation;
    this.fixSuggestion = violation.fixSuggestion;
  }
}

export class RulesEngine {
  constructor() {
    this.rules = [];
  }

  /**
   * Register a new validation rule
   */
  register(rule) {
    if (!rule.id || !rule.method || typeof rule.validate !== 'function') {
      throw new Error(`Invalid rule definition: must contain id, method, and validate function.`);
    }
    this.rules.push(rule);
    return this;
  }

  /**
   * Get all rules or rules for a specific method
   */
  getRules(method) {
    if (!method) return [...this.rules];
    return this.rules.filter(r => r.method === '*' || r.method === method);
  }

  /**
   * Validate a request payload against registered rules
   * Returns array of violations (empty if valid)
   */
  validate(method, payload) {
    const applicableRules = this.getRules(method);
    const violations = [];

    for (const rule of applicableRules) {
      try {
        const result = rule.validate(payload);
        if (result) {
          violations.push({
            ruleId: rule.id,
            description: result.description || rule.description,
            violation: result.violation,
            fixSuggestion: result.fixSuggestion,
          });
        }
      } catch (err) {
        console.error(`Rule execution error in [${rule.id}]:`, err);
      }
    }

    return violations;
  }

  /**
   * Intercept and assert validity.
   * If invalid, renders terminal warning and throws PreflightValidationError.
   */
  assert(method, payload, options = { silent: false }) {
    const violations = this.validate(method, payload);

    if (violations.length > 0) {
      const primary = violations[0];

      if (!options.silent) {
        const output = formatPreflightBlock({
          method,
          ruleId: primary.ruleId,
          description: primary.description,
          violation: primary.violation,
          fixSuggestion: primary.fixSuggestion,
        });
        console.log('\n' + output);
        logger.error(`Request rejected before dispatching. Fix the code according to above guidance.`);
      }

      throw new PreflightValidationError(method, primary);
    }

    if (!options.silent) {
      logger.preflightPass(`Outbound ${method} passed local pre-flight checks.`);
    }

    return true;
  }
}
