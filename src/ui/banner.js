import chalk from 'chalk';

export function getBanner() {
  const logo = `
   ____       _       __        __              _     ___ 
  / ___| __ _| |_ ___ \\ \\      / /_ _ _   _    / \\   |_ _|
 | |  _ / _\` | __/ _ \\ \\ \\ /\\ / / _\` | | | |  / _ \\   | | 
 | |_| | (_| | ||  __/  \\ V  V / (_| | |_| | / ___ \\  | | 
  \\____|\\__,_|\\__\\___|   \\_/\\_/ \\__,_|\\__, |/_/   \\_\\|___|
                                      |___/               
  `;

  const tagline = chalk.bold.hex('#00D2FF')('  ⚡ Autonomous Local Developer Agent for Payment Integrations');
  const meta = chalk.dim('  Track: Razorpay AI Buildathon | Engine: Gemini 2.5 Flash | Mode: Localhost\n');

  return chalk.hex('#3B82F6')(logo) + '\n' + tagline + '\n' + meta;
}

export function printBanner() {
  console.log(getBanner());
}
