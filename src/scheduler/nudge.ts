import { logger } from '../lib/logger.js';
import { query } from '../db/pool.js';

function formatCountdown(deadline: Date): string {
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) {
    const overdueMins = Math.floor(Math.abs(diffMs) / 60000);
    if (overdueMins > 60) {
      return `🔴 OVERDUE by ${Math.floor(overdueMins / 60)}h ${overdueMins % 60}m!`;
    }
    return `🔴 OVERDUE by ${overdueMins}m!`;
  }

  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hours > 0) {
    return `⏰ ${hours}h ${minutes}m left`;
  } else if (minutes > 5) {
    return `⏰ ${minutes}m ${secs}s left`;
  } else if (minutes > 1) {
    return `⚡ ${minutes}m ${secs}s — Hurry!`;
  } else {
    return `🔥 LAST ${secs}s! GO GO GO!`;
  }
}

// In-memory map: commitment_id → { channel_id, message_ts }
const nudgeMessages = new Map<string, { channel: string; ts: string }>();

async function getDueCommitments() {
  const r = await query(
    `SELECT * FROM commitments
         WHERE status IN ('pending', 'confirmed')
         AND deadline IS NOT NULL
         AND deadline <= NOW() + INTERVAL '30 minutes'
         ORDER BY deadline ASC`,
  );
  return r.rows;
}

export function startSchedule(app: any) {
  const CHECK_INTERVAL = 30000; // every 30 seconds (was 10s — caused rate limits)
  const lastUpdate = new Map<string, number>(); // track last update time per commitment
  const MIN_UPDATE_INTERVAL = 25000; // don't update same message more than once per 25s

  setInterval(async () => {
    try {
      const dueSoon = await getDueCommitments();
      const activeIds = new Set(dueSoon.map((c: any) => c.id));

      // Clean up expired nudges from memory
      for (const [id] of nudgeMessages) {
        if (!activeIds.has(id)) {
          nudgeMessages.delete(id);
          lastUpdate.delete(id);
        }
      }

      for (const commitment of dueSoon) {
        const deadline = commitment.deadline ? new Date(commitment.deadline) : null;
        if (!deadline) continue;

        // Skip if updated recently
        const lastTs = lastUpdate.get(commitment.id) || 0;
        if (Date.now() - lastTs < MIN_UPDATE_INTERVAL) continue;

        const isOverdue = deadline.getTime() < Date.now();
        const urgency = isOverdue ? '🚨' : '⏰';
        const countdown = formatCountdown(deadline);
        const msgText = `${countdown}\n${urgency} <@${commitment.owner_id}>, your task *"${commitment.task_description}"* is${isOverdue ? ' OVERDUE' : ' due'}!`;

        // Build blocks with action buttons for overdue items
        const blocks: any[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: msgText },
          },
        ];

        if (isOverdue) {
          blocks.push({
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '✅ Mark Complete', emoji: true },
                style: 'primary',
                action_id: 'commitment_complete',
                value: commitment.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '🚨 Emergency', emoji: true },
                style: 'danger',
                action_id: 'commitment_emergency',
                value: commitment.id,
              },
            ],
          });
        }

        const existing = nudgeMessages.get(commitment.id);

        if (existing) {
          // UPDATE existing message with new countdown
          try {
            await app.client.chat.update({
              channel: existing.channel,
              ts: existing.ts,
              text: msgText,
              blocks,
            });
            lastUpdate.set(commitment.id, Date.now());
          } catch {
            // Message might have been deleted, remove from map
            nudgeMessages.delete(commitment.id);
            lastUpdate.delete(commitment.id);
          }
        } else {
          // First nudge — post a new message
          try {
            const result = await app.client.chat.postMessage({
              channel: commitment.channel_id,
              text: msgText,
              blocks,
            });
            if (result.ts) {
              nudgeMessages.set(commitment.id, {
                channel: commitment.channel_id,
                ts: result.ts,
              });
              lastUpdate.set(commitment.id, Date.now());
            }
          } catch (err) {
            logger.error({ err, id: commitment.id }, 'Failed to send first nudge');
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Scheduler error — will retry');
    }
  }, CHECK_INTERVAL);
}
