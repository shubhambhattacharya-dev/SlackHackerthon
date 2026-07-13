import { logger } from '../lib/logger.js';
import { detectCommitment } from '../ai/tools.js';
import { SlackEventMiddlewareArgs } from '@slack/bolt';
import { detectionCard } from '../slack/cards/detection.js';
import { createCommitment, updateDeadline } from '../db/queries.js';
import { query } from '../db/pool.js';
import { v4 as uuid } from 'uuid';

const formatDue = (due: Date | null): string => {
  if (!due) return 'no specific time';

  return due.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

/* Slack renders <!date> in the user's timezone */
const slackDate = (due: Date | null): string => {
  if (!due) return '*no specific time*';

  const unix = Math.floor(due.getTime() / 1000);
  return `<!date^${unix}^{date_short_pretty} at {time}|${formatDue(due)}>`;
};

// ── Conversation linking patterns ──────────────────────────────────────
// Detects messages like "actually, make it 10pm" or "update: deadline is tomorrow"
const UPDATE_PATTERNS = [
  /^(?:actually|actually,?|update:?\s*|change:?\s*|new deadline:?\s*|make (?:it|that) |reschedule(?:d)?:?\s*)(.+)/i,
  /^(?:let me change (?:it|that) to|push (?:it|that) to|move (?:it|that) to|set (?:it|that) to)\s+(.+)/i,
];

interface LinkedUpdate {
  text: string;
  dueTime: Date | null;
}

function detectUpdate(text: string): LinkedUpdate | null {
  for (const pattern of UPDATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Try to extract a time from the matched text
      const timeText = match[1];
      const parsed = extractTime(timeText);
      return { text: timeText, dueTime: parsed };
    }
  }
  return null;
}

function extractTime(text: string): Date | null {
  // Simple time extraction: "10pm", "10:30 PM", "tomorrow 5pm", etc.
  const now = new Date();

  // Try "HH:MM PM" or "HH PM"
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3].toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    // If time already passed today, assume tomorrow
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  }

  // Try "tomorrow"
  if (text.toLowerCase().includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0); // Default to 6 PM
    return tomorrow;
  }

  // Try "next week"
  if (text.toLowerCase().includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(18, 0, 0, 0);
    return nextWeek;
  }

  // Try HH:MM (24h)
  const militaryMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1]);
    const minutes = parseInt(militaryMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const target = new Date(now);
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return target;
    }
  }

  return null;
}

async function findLatestCommitment(userId: string, channelId: string): Promise<string | null> {
  try {
    const result = await query<{ id: string }>(
      `SELECT id FROM commitments
       WHERE owner_id = $1 AND channel_id = $2 AND status IN ('pending', 'confirmed')
       ORDER BY created_at DESC LIMIT 1`,
      [userId, channelId],
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    logger.error({ error }, 'Failed to find latest commitment');
    return null;
  }
}

export const handleMessage = async ({ message, say }: SlackEventMiddlewareArgs<'message'>) => {
  if (!message || !('text' in message) || typeof message.text !== 'string') return;
  if (('bot_id' in message && message.bot_id) || message.subtype) return;

  logger.info(
    {
      channel: message.channel,
      user: message.user,
      text: message.text,
      ts: message.ts,
    },
    'Message received',
  );

  // ── Check for conversation linking (update pattern) ─────────────────
  const update = detectUpdate(message.text);
  if (update) {
    const commitmentId = await findLatestCommitment(message.user, message.channel);
    if (commitmentId && update.dueTime) {
      try {
        await updateDeadline(commitmentId, update.dueTime);
        await say({
          text: `📝 Updated deadline for your commitment to ${slackDate(update.dueTime)}`,
        });
        logger.info(
          { commitmentId, newDeadline: update.dueTime },
          'Commitment deadline updated via conversation linking',
        );
        return;
      } catch (error) {
        logger.error({ error, commitmentId }, 'Failed to update deadline');
      }
    }
  }

  // ── Normal commitment detection ──────────────────────────────────────
  let commitment;
  try {
    commitment = await detectCommitment(message.text);
  } catch (err) {
    logger.error({ err, text: message.text }, 'detectCommitment failed');
    return;
  }

  if (!commitment) return;

  logger.info(
    {
      user: message.user,
      text: commitment.text,
      dueTime: commitment.dueTime,
      confidence: commitment.confidence,
      score: commitment.score,
    },
    'Commitment detected',
  );

  const confidenceEmoji =
    commitment.confidence === 'high' ? '✅' : commitment.confidence === 'medium' ? '🟡' : '⚪';

  const commitmentId = uuid();

  await say({
    blocks: detectionCard({
      owner: message.user,
      task: commitment.text,
      deadline: slackDate(commitment.dueTime),
      commitmentId,
      confidence: commitment.confidence,
    }).blocks,
    text: `${confidenceEmoji} Commitment detected: ${commitment.text}`,
  });

  try {
    await createCommitment({
      id: commitmentId,
      slackMessageTs: message.ts,
      channelId: message.channel,
      ownerId: message.user,
      taskDescription: commitment.text,
      deadline: commitment.dueTime ?? undefined,
    });
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to save commitment to DB');
    try {
      await say({
        text: `⚠️ Commitment detected but failed to save. Please try again.`,
      });
    } catch {
      // Ignore secondary failure
    }
  }
};
