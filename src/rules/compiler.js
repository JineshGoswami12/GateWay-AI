
function getNestedValue(obj, path) {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

export function compileDeclarativeRule(def) {
  if (!def || !def.id || !def.method) {
    throw new Error('Rule definition must include at least "id" and "method".');
  }

  const id = def.id;
  const method = def.method;
  const description = def.description || `Rule validation failed for ${def.field || id}`;
  const field = def.field || '';
  const condition = (def.condition || 'disallowed').toLowerCase();
  const targetValue = def.targetValue !== undefined ? def.targetValue : def.target_value;
  const fixSuggestion = def.fixSuggestion || def.fix_suggestion || `// Update payload field: ${field}`;
  const origin = def.origin || 'ai_proposed';

  return {
    id,
    method,
    description,
    origin,
    field,
    condition,
    targetValue,
    fixSuggestion,
    validate: (payload) => {
      const val = field ? getNestedValue(payload, field) : undefined;
      let violated = false;
      let expected = '';

      switch (condition) {
        case 'disallowed': {
          if (targetValue !== undefined && targetValue !== null && targetValue !== '') {
            // If targetValue is provided, check if val matches targetValue
            if (val !== undefined && val !== null && String(val).toLowerCase() === String(targetValue).toLowerCase()) {
              violated = true;
              expected = `Not '${targetValue}' (or omitted)`;
            }
          } else {
            // Disallow any value for this field
            if (val !== undefined && val !== null && val !== '') {
              violated = true;
              expected = 'Field should be omitted';
            }
          }
          break;
        }

        case 'required': {
          if (val === undefined || val === null || val === '') {
            violated = true;
            expected = targetValue ? `Defined value (${targetValue})` : 'Non-empty required field';
          }
          break;
        }

        case 'equals': {
          if (val === undefined || val === null || String(val).toLowerCase() !== String(targetValue).toLowerCase()) {
            violated = true;
            expected = `'${targetValue}'`;
          }
          break;
        }

        case 'not_equals': {
          if (val !== undefined && val !== null && String(val).toLowerCase() === String(targetValue).toLowerCase()) {
            violated = true;
            expected = `Value other than '${targetValue}'`;
          }
          break;
        }

        case 'max_length': {
          const max = Number(targetValue) || 40;
          if (typeof val === 'string' && val.length > max) {
            violated = true;
            expected = `<= ${max} characters (received ${val.length})`;
          }
          break;
        }

        case 'min_value': {
          const min = Number(targetValue) || 0;
          if (typeof val === 'number' && val < min) {
            violated = true;
            expected = `>= ${min} (received ${val})`;
          }
          break;
        }

        case 'regex': {
          if (targetValue && typeof val === 'string') {
            const re = new RegExp(targetValue);
            if (!re.test(val)) {
              violated = true;
              expected = `Must match pattern ${targetValue}`;
            }
          }
          break;
        }

        default: {
          if (val !== undefined && val !== null) {
            violated = true;
            expected = 'Omitted or valid field';
          }
          break;
        }
      }

      if (violated) {
        return {
          description,
          violation: {
            field: field || 'payload',
            value: val,
            expected: expected || 'Valid format'
          },
          fixSuggestion
        };
      }

      return null;
    }
  };
}
