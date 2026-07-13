import { App, SocketModeReceiver } from '@slack/bolt';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { handleMessage } from './slack/handler.js';
import { initializeDatabase } from './db/schema.js';
import { registerActions } from './slack/actions.js';
import { startSchedule } from './scheduler/nudge.js';
import { startHealthCheck } from './db/pool.js';
import { getDashboardSummary } from './slack/dashboard.js';

// Prevent crash from unhandled rejections / DB DNS issues
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection — caught, keeping alive');
});
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception — caught, keeping alive');
});

(async () => {
  const receiver = new SocketModeReceiver({
    appToken: config.slack.appToken,
  });

  const app = new App({
    token: config.slack.botToken,
    receiver,
  });

  app.message(handleMessage);

  // Handle edited messages (message_changed events)
  app.event('message', async ({ event, say }) => {
    const e = event as any;
    if (e.subtype !== 'message_changed') return;
    const edited = e.message;
    if (!edited?.text || edited.bot_id) return;

    logger.info(
      {
        channel: e.channel,
        user: edited.user,
        text: edited.text,
        ts: edited.ts,
        subtype: 'message_changed',
      },
      'Edited message received',
    );

    // Re-run the same handler logic with the edited text
    await handleMessage({
      message: {
        text: edited.text,
        channel: e.channel,
        user: edited.user,
        ts: edited.ts,
        bot_id: undefined,
        subtype: undefined,
      } as any,
      say,
    } as any);
  });

  registerActions(app);
  startSchedule(app);

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

  startHealthCheck();
  await initializeDatabase();
  await app.start();
  logger.info('Amnesia Agent started (Socket Mode)');
})();
