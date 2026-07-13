import { App, HTTPReceiver } from '@slack/bolt';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { handleMessage } from './slack/handler.js';
import { initializeDatabase } from './db/schema.js';
import { registerActions } from './slack/actions.js';
import { startSchedule } from './scheduler/nudge.js';
import { startHealthCheck } from './db/pool.js';
import { getDashboardSummary } from './slack/dashboard.js';

const receiver = new HTTPReceiver({
  signingSecret: config.slack.signingSecret,
  endpoints: '/slack/events',
  port: config.port,
  processBeforeResponse: true,
});

const app = new App({
  token: config.slack.botToken,
  receiver,
});

// Prevent crash from unhandled rejections / DB DNS issues
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection — caught, keeping alive');
});
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception — caught, keeping alive');
});

app.message(handleMessage);
registerActions(app);
startSchedule(app);

// ── Slash command: /commitments ──────────────────────────────────────
app.command('/commitments', async ({ ack, respond }) => {
  await ack();
  const summary = await getDashboardSummary();
  await respond({ text: summary, response_type: 'ephemeral' });
});

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    await app.stop();

    process.exit(0);
  });
});

// Start periodic DB health check
startHealthCheck();

(async () => {
  await initializeDatabase();
  await app.start();
  logger.info(`Amnesia Agent listening on port ${config.port}`);
})();
