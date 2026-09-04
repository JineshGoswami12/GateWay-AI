import boxen from 'boxen';
import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Format Pre-Flight Validation Interception
 */
export function formatPreflightBlock({ method, ruleId, description, violation, fixSuggestion }) {
  const title = chalk.bold.hex('#EF4444')('[VALIDATION BLOCKED]');
  const subtitle = chalk.dim(`Method: `) + chalk.white.bold(method) + chalk.dim(` | Rule: `) + chalk.red.bold(ruleId);

  let body = `${subtitle}\n\n`;
  body += `${chalk.bold.white('Reason:')} ${chalk.red(description)}\n`;
  
  if (violation) {
    body += `${chalk.bold.white('Offending Field:')} ${chalk.cyan(violation.field)} = ${chalk.yellow(JSON.stringify(violation.value))}\n`;
    body += `${chalk.bold.white('Expected:')} ${chalk.green(violation.expected)}\n`;
  }

  if (fixSuggestion) {
    body += `\n${chalk.bold.white('Suggested Code Fix:')}\n`;
    body += chalk.bgHex('#1E293B').white(
      fixSuggestion
        .split('\n')
        .map(line => {
          if (line.trim().startsWith('-')) return chalk.red(line);
          if (line.trim().startsWith('+')) return chalk.green(line);
          return chalk.dim(line);
        })
        .join('\n')
    );
  }

  body += `\n\n${chalk.dim('Intercepted locally before dispatching to network or payment gateway.')}`;

  return boxen(body, {
    title,
    titleAlignment: 'left',
    padding: 1,
    margin: { top: 0, bottom: 1 },
    borderStyle: 'round',
    borderColor: 'red',
  });
}

/**
 * Format AI Error Translation (Gemini 2.5 Flash)
 */
export function formatAiDiagnosis({ error, diagnosis, method }) {
  const title = chalk.bold.hex('#6366F1')('AI ERROR TRANSLATOR') + chalk.dim(' (Gemini 2.5 Flash)');
  const errorHeader = chalk.dim('Gateway Response: ') + chalk.red.bold(error.code || 'GATEWAY_ERROR') + 
    chalk.dim(` (${error.description || 'Request failed'})`) +
    chalk.dim(` | Method: `) + chalk.white.bold(method || 'unknown');

  let body = `${errorHeader}\n\n`;

  // 1. Plain English Explanation
  body += `${chalk.bold.white('Analysis:')}\n`;
  body += `${diagnosis.explanation}\n\n`;

  // 2. Likely Root Cause
  body += `${chalk.bold.white('Root Cause:')}\n`;
  body += `${diagnosis.rootCause}\n\n`;

  // 3. Concrete Code Fix
  body += `${chalk.bold.white('Suggested Code Fix:')}\n`;
  body += boxen(
    diagnosis.codeFix
      .split('\n')
      .map(line => {
        if (line.trim().startsWith('-')) return chalk.red(line);
        if (line.trim().startsWith('+')) return chalk.green(line);
        return chalk.white(line);
      })
      .join('\n'),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: 0,
      borderStyle: 'single',
      borderColor: 'gray',
    }
  );

  // 4. Suggested Action
  if (diagnosis.suggestedAction) {
    body += `\n\n${chalk.bold.white('Recommended Action:')} ${diagnosis.suggestedAction}`;
  }

  if (diagnosis.documentationLink) {
    body += `\n${chalk.dim('Reference Documentation:')} ${chalk.blue.underline(diagnosis.documentationLink)}`;
  }

  // 5. Proposed Pre-Flight Rule (Self-Improving Loop)
  if (diagnosis.proposedRule) {
    body += `\n\n${chalk.bold.hex('#F59E0B')('Proposed Pre-Flight Rule (Self-Improving Loop):')}\n`;
    body += `${chalk.dim('Rule ID:')} ${chalk.yellow.bold(diagnosis.proposedRule.id)} | ${chalk.dim('Method:')} ${chalk.white(diagnosis.proposedRule.method)}\n`;
    body += `${chalk.dim('Warning:')} ${diagnosis.proposedRule.description}\n`;
    body += `${chalk.dim('Action:')} Confirm via console UI to register as permanent local rule.`;
  }

  return boxen(body, {
    title,
    titleAlignment: 'left',
    padding: 1,
    margin: { top: 0, bottom: 1 },
    borderStyle: 'round',
    borderColor: 'magenta',
  });
}

/**
 * Format Multi-Step Webhook Delivery Sequence Table
 */
export function formatWebhookSequenceTable(events) {
  const table = new Table({
    head: [
      chalk.bold('Step'),
      chalk.bold('Event Name'),
      chalk.bold('Target Endpoint'),
      chalk.bold('Signature (HMAC)'),
      chalk.bold('Status'),
      chalk.bold('Latency')
    ],
    style: { head: ['cyan'], border: ['gray'] }
  });

  events.forEach((evt, idx) => {
    const statusColor = evt.statusCode >= 200 && evt.statusCode < 300 
      ? chalk.green.bold(`${evt.statusCode} OK`)
      : chalk.red.bold(`${evt.statusCode || 'ERR'} FAIL`);
    
    const sigStatus = evt.signatureVerified !== false 
      ? chalk.green('Valid (SHA-256)') 
      : chalk.red('Invalid');

    table.push([
      chalk.yellow.bold(`#${idx + 1}`),
      chalk.cyan.bold(evt.event),
      chalk.dim(evt.targetUrl),
      sigStatus,
      statusColor,
      chalk.dim(`${evt.latencyMs}ms`)
    ]);
  });

  return table.toString();
}

/**
 * Format Rules Engine Table
 */
export function formatRulesTable(rules) {
  const table = new Table({
    head: [chalk.bold('Rule ID'), chalk.bold('Target Method'), chalk.bold('Enforced Policy')],
    style: { head: ['cyan'], border: ['gray'] }
  });

  rules.forEach(r => {
    table.push([
      chalk.hex('#F59E0B').bold(r.id),
      chalk.green(r.method),
      chalk.white(r.description)
    ]);
  });

  return table.toString();
}
