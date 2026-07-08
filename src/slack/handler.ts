import { logger } from "../lib/logger.js";
import { detectCommitment } from "../ai/tools.js";

/* Format a Date nicely, or return a friendly fallback */
const formatDue = (due: Date | null): string => {
  if (!due) return "no specific time";
  return due.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

/* Slack renders <!date> natively in the user's own timezone — even nicer */
const slackDate = (due: Date | null): string => {
  if (!due) return "*no specific time*";
  const unix = Math.floor(due.getTime() / 1000);
  return `<!date^${unix}^{date_short_pretty} at {time}|${formatDue(due)}>`;
};

export const handleMessage = async ({ message, say, client }: any) => {
  // Guard clauses
  if (!message || typeof message.text !== "string") return;
  if (message.bot_id || message.subtype) return; // skip bots, edits, joins, etc.

  logger.info("Message received", {
    channel: message.channel,
    user: message.user,
    text: message.text,
    ts: message.ts,
  });

  let commitment;
  try {
    commitment = detectCommitment(message.text);
  } catch (err) {
    logger.error("detectCommitment failed", { err, text: message.text });
    return; // fail silently rather than crashing the handler
  }

  if (commitment) {
    logger.info("Commitment detected", {
      user: message.user,
      text: commitment.text,
      dueTime: commitment.dueTime,
      confidence: commitment.confidence,
      score: commitment.score,
    });

    const confidenceEmoji =
      commitment.confidence === "high" ? "✅" :
      commitment.confidence === "medium" ? "🟡" : "⚪";

    await say({
      thread_ts: message.thread_ts ?? message.ts, // reply in thread, not channel
      text:
        `${confidenceEmoji} *Commitment detected* (<@${message.user}>)\n` +
        `> ${commitment.text}\n` +
        `🕒 Due: ${slackDate(commitment.dueTime)}  ·  ` +
        `confidence: *${commitment.confidence}*`,
    });

    // TODO: persist to DB + schedule a reminder (see note below)
    return;
  }

  await say({
    thread_ts: message.thread_ts ?? message.ts,
    text: `Echo: ${message.text}`,
  });
};
