import { logger } from "../lib/logger.js";
import { detectCommitment } from "../ai/tools.js";
import { SlackEventMiddlewareArgs } from "@slack/bolt";
import { detectionCard } from "../slack/cards/detection.js";
import { v4 as uuid } from "uuid";


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

/* Slack renders <!date> in the user's timezone */
const slackDate = (due: Date | null): string => {
  if (!due) return "*no specific time*";

  const unix = Math.floor(due.getTime() / 1000);
  return `<!date^${unix}^{date_short_pretty} at {time}|${formatDue(due)}>`;
};

export const handleMessage = async ({
  message,
  say,
}: SlackEventMiddlewareArgs<"message">) => {
if (!message || !("text" in message) || typeof message.text !== "string") return;
if (("bot_id" in message && message.bot_id) || message.subtype) return;

  logger.info({
    channel: message.channel,
    user: message.user,
    text: message.text,
    ts: message.ts,
  }, "Message received");

  let commitment;
  try {
    commitment = await detectCommitment(message.text);
  } catch (err) {
    logger.error({ err, text: message.text }, "detectCommitment failed");
    return;
  }

  if (!commitment) return;

  logger.info({
    user: message.user,
    text: commitment.text,
    dueTime: commitment.dueTime,
    confidence: commitment.confidence,
    score: commitment.score,
  }, "Commitment detected");

  const confidenceEmoji =
    commitment.confidence === "high"
      ? "✅"
      : commitment.confidence === "medium"
      ? "🟡"
      : "⚪";

  const commitmentId = uuid();

  await say({
    blocks: detectionCard({
      owner: message.user,
      task: commitment.text,
      deadline: slackDate(commitment.dueTime),
      commitmentId,
      confidence: commitment.confidence,
    }).blocks,
    text:
      `${confidenceEmoji} Commitment detected: ${commitment.text}`,
  });

  // TODO: Save to database and schedule reminder.
};