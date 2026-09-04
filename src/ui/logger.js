import chalk from 'chalk';

export const badges = {
  preflight: chalk.bgHex('#DC2626').white.bold(' PRE-FLIGHT BLOCKED '),
  preflightPass: chalk.bgHex('#059669').white.bold(' PRE-FLIGHT PASSED '),
  ai: chalk.bgHex('#7C3AED').white.bold(' AI ERROR TRANSLATOR '),
  webhook: chalk.bgHex('#2563EB').white.bold(' AGENTIC WEBHOOK SIMULATOR '),
  gateway: chalk.bgHex('#4B5563').white.bold(' MOCK GATEWAY '),
  info: chalk.bgHex('#0284C7').white.bold(' GATEWAY-AI '),
};

export function timestamp() {
  const now = new Date();
  return chalk.dim(`[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}]`);
}

export const logger = {
  preflight(msg) {
    console.log(`${timestamp()} ${badges.preflight} ${msg}`);
  },
  preflightPass(msg) {
    console.log(`${timestamp()} ${badges.preflightPass} ${msg}`);
  },
  ai(msg) {
    console.log(`${timestamp()} ${badges.ai} ${msg}`);
  },
  webhook(msg) {
    console.log(`${timestamp()} ${badges.webhook} ${msg}`);
  },
  gateway(msg) {
    console.log(`${timestamp()} ${badges.gateway} ${msg}`);
  },
  info(msg) {
    console.log(`${timestamp()} ${badges.info} ${msg}`);
  },
  success(msg) {
    console.log(`${timestamp()} ${chalk.green('✔')} ${msg}`);
  },
  warn(msg) {
    console.log(`${timestamp()} ${chalk.yellow('⚠')} ${msg}`);
  },
  error(msg) {
    console.log(`${timestamp()} ${chalk.red('✖')} ${msg}`);
  }
};
