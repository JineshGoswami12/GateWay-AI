#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import express from 'express';
import { printBanner } from '../src/ui/banner.js';
import { logger } from '../src/ui/logger.js';
import { formatRulesTable } from '../src/ui/formatters.js';
import { standardRules } from '../src/rules/rules.js';
import { defaultStore } from '../src/storage/store.js';
import { signPayload } from '../src/webhooks/simulator.js';

const program = new Command();

program
  .name('gateway-ai')
  .description('AI-powered local developer companion for payment gateway integrations')
  .version('1.0.0');

// Command: rules
program
  .command('rules')
  .description('List all active pre-flight validation rules')
  .action(() => {
    printBanner();
    console.log(chalk.bold.cyan('📋 Active Pre-Flight Validation Rules:'));
    console.log(formatRulesTable(standardRules));
    console.log(chalk.dim(`\nTotal Rules: ${standardRules.length}. Extensible via gateway.registerRule(...)\n`));
  });

// Command: demo
program
  .command('demo')
  .description('Run the automated live demo showcasing all 3 agentic behaviors')
  .action(async () => {
    printBanner();
    const { runDemo } = await import('../demo/run-demo.js');
    await runDemo();
  });

// Command: logs
program
  .command('logs')
  .description('Inspect local history of intercepted requests, errors, and webhooks')
  .option('-t, --type <type>', 'Filter logs (orders, webhooks, errors)', 'all')
  .action((opts) => {
    printBanner();
    console.log(chalk.bold.cyan('📂 Local State & Event Log (.gateway-ai/):\n'));

    if (opts.type === 'all' || opts.type === 'orders') {
      const orders = defaultStore.read('orders');
      console.log(chalk.bold.yellow(`🛒 Mock Orders (${orders.length}):`));
      const orderTable = new Table({
        head: ['ID', 'Amount', 'Currency', 'Receipt', 'Status', 'Created At'],
        style: { head: ['yellow'] }
      });
      orders.slice(0, 5).forEach(o => {
        orderTable.push([o.id, `₹${(o.amount / 100).toFixed(2)}`, o.currency, o.receipt || '-', o.status, new Date(o.created_at * 1000).toLocaleTimeString()]);
      });
      console.log(orderTable.toString() + '\n');
    }

    if (opts.type === 'all' || opts.type === 'webhooks') {
      const webhooks = defaultStore.read('webhooks');
      console.log(chalk.bold.green(`📡 Delivered Webhooks (${webhooks.length}):`));
      const whTable = new Table({
        head: ['Event ID', 'Event Name', 'Status', 'Latency', 'Target'],
        style: { head: ['green'] }
      });
      webhooks.slice(0, 5).forEach(w => {
        whTable.push([w.id, w.event, `${w.statusCode} OK`, `${w.latencyMs}ms`, w.targetUrl]);
      });
      console.log(whTable.toString() + '\n');
    }

    if (opts.type === 'all' || opts.type === 'errors') {
      const errors = defaultStore.read('errors');
      console.log(chalk.bold.red(`🧠 AI Diagnosed Errors (${errors.length}):`));
      errors.slice(0, 3).forEach((e, idx) => {
        console.log(chalk.bold(`  #${idx + 1} [${e.method}] - ${e.error?.code || 'ERROR'}`));
        console.log(chalk.dim(`     Explanation: ${e.diagnosis?.explanation}`));
        console.log(chalk.dim(`     Fix: ${e.diagnosis?.suggestedAction}\n`));
      });
    }
  });

// Command: listen
program
  .command('listen')
  .description('Start a local webhook inspection server on port 3000')
  .option('-p, --port <port>', 'Port to listen on', 3000)
  .action((opts) => {
    printBanner();
    const app = express();
    const port = opts.port;
    const secret = process.env.GATEWAY_WEBHOOK_SECRET || 'gateway_ai_secret_xyz123';

    app.use(express.json());

    app.post('/webhook', (req, res) => {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = JSON.stringify(req.body);
      const expected = signPayload(rawBody, secret);
      const isValid = signature === expected;

      console.log('\n' + chalk.bgHex('#2563EB').white.bold(' 📥 INCOMING WEBHOOK RECEIVED '));
      console.log(chalk.cyan(`Event: ${chalk.bold(req.body.event)}`));
      console.log(`Signature: ${isValid ? chalk.green('✔ Valid') : chalk.red('✖ Invalid')}`);
      console.log(chalk.dim(JSON.stringify(req.body.payload, null, 2)));

      res.status(200).json({ received: true, verified: isValid });
    });

    app.listen(port, () => {
      logger.info(`Webhook inspector listening at http://localhost:${port}/webhook`);
      logger.info(`Ready to receive simulated events from GateWay-AI`);
    });
  });

// Command: clear
program
  .command('clear')
  .description('Clear local mock store and event history')
  .action(() => {
    defaultStore.clear();
    console.log(chalk.green('✔ Local .gateway-ai/ storage cleared.'));
  });

// If no arguments, show banner and help
if (!process.argv.slice(2).length) {
  printBanner();
  program.outputHelp();
} else {
  program.parse(process.argv);
}
