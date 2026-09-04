import { GoogleGenAI } from '@google/genai';
import ora from 'ora';
import chalk from 'chalk';
import { formatAiDiagnosis } from '../ui/formatters.js';
import { logger } from '../ui/logger.js';
import { defaultStore } from '../storage/store.js';
import { getDeterministicDiagnosis } from './mockTranslator.js';

export class AiErrorTranslator {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    this.apiKey = apiKey;
    this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    this.model = 'gemini-2.5-flash';
  }

  /**
   * Translate a payment gateway error into actionable developer guidance using Gemini 2.5 Flash
   */
  async diagnose({ error, method, requestPayload, endpoint = '/v1/...' }) {
    const errorDetails = error?.response?.error || error?.error || error;
    const spinner = ora({
      text: chalk.hex('#A855F7')('Consulting Gemini 2.5 Flash for error reasoning and code fix...'),
      color: 'magenta'
    }).start();

    let diagnosis = null;

    if (this.client && this.apiKey) {
      try {
        const prompt = `
You are GateWay-AI, an expert payment gateway integration assistant.
A developer's outbound API call to a Razorpay-style payment gateway failed with a gateway error.
Analyze the request context and error details, and call the "report_error_diagnosis" function with a structured, developer-focused explanation, the exact root cause, a concrete code diff snippet showing the fix, and an actionable next step.

If the error was caused by a client-side request mistake (e.g., passing a conflicting or disallowed currency, invalid parameter format, or missing required field) that could be intercepted locally in the future, provide a "proposedRule" in the tool call. This allows the developer's pre-flight validation engine to learn this failure pattern and block identical requests locally in <1ms without consuming gateway API quota.

Context:
- API Method: ${method}
- Endpoint: ${endpoint}
- Outbound Payload Sent: ${JSON.stringify(requestPayload || {}, null, 2)}
- Gateway Error Response: ${JSON.stringify(errorDetails, null, 2)}
`;

        const response = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            tools: [{
              functionDeclarations: [{
                name: 'report_error_diagnosis',
                description: 'Report structured payment gateway error diagnosis, actionable code fix, and an optional proposed pre-flight rule',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    explanation: {
                      type: 'STRING',
                      description: 'Plain-English explanation of what went wrong for the developer'
                    },
                    rootCause: {
                      type: 'STRING',
                      description: 'The exact technical root cause behind the gateway rejection'
                    },
                    codeFix: {
                      type: 'STRING',
                      description: 'A concrete, actionable code diff snippet showing the code fix'
                    },
                    suggestedAction: {
                      type: 'STRING',
                      description: 'Immediate next step or recommendation for the developer'
                    },
                    documentationLink: {
                      type: 'STRING',
                      description: 'Official payment gateway documentation link for reference'
                    },
                    proposedRule: {
                      type: 'OBJECT',
                      description: 'Optional proposed pre-flight validation rule to intercept this specific mistake locally in future outbound calls',
                      properties: {
                        id: {
                          type: 'STRING',
                          description: 'Uppercase snake_case unique rule identifier, e.g. CAPTURE_CURRENCY_NOT_ALLOWED'
                        },
                        method: {
                          type: 'STRING',
                          description: 'The target API method, e.g. payments.capture or orders.create'
                        },
                        description: {
                          type: 'STRING',
                          description: 'Human-readable warning message shown to the developer when this rule triggers'
                        },
                        field: {
                          type: 'STRING',
                          description: 'The target payload field being validated, e.g. currency or receipt'
                        },
                        condition: {
                          type: 'STRING',
                          description: 'Validation operator: "disallowed" | "required" | "equals" | "not_equals" | "max_length"'
                        },
                        targetValue: {
                          type: 'STRING',
                          description: 'The target or disallowed value (e.g. "USD", "40")'
                        },
                        fixSuggestion: {
                          type: 'STRING',
                          description: 'Actionable code diff snippet showing how to resolve the pre-flight violation'
                        }
                      },
                      required: ['id', 'method', 'description', 'field', 'condition', 'fixSuggestion']
                    }
                  },
                  required: ['explanation', 'rootCause', 'codeFix', 'suggestedAction']
                }
              }]
            }],
            toolConfig: {
              functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: ['report_error_diagnosis']
              }
            }
          }
        });

        // Extract structured tool call arguments
        const functionCall = response.functionCalls?.[0] || 
          response.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;

        if (functionCall && functionCall.args) {
          diagnosis = functionCall.args;
          spinner.succeed(chalk.green('Gemini 2.5 Flash diagnosis complete.'));
        } else {
          // Fallback if model answered without functionCall
          throw new Error('No structured tool call returned by model');
        }
      } catch (err) {
        spinner.warn(chalk.yellow(`Gemini API call failed (${err.message}). Using local reasoning fallback.`));
        diagnosis = getDeterministicDiagnosis({ error: errorDetails, method, requestPayload });
      }
    } else {
      spinner.info(chalk.dim('No GEMINI_API_KEY detected. Using local reasoning engine.'));
      diagnosis = getDeterministicDiagnosis({ error: errorDetails, method, requestPayload });
    }

    // Render formatted terminal box
    const card = formatAiDiagnosis({
      error: errorDetails,
      diagnosis,
      method
    });
    console.log('\n' + card + '\n');

    // Save error record
    defaultStore.append('errors', {
      timestamp: new Date().toISOString(),
      method,
      error: errorDetails,
      diagnosis
    });

    return diagnosis;
  }
}
