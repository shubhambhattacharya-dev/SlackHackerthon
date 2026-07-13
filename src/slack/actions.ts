import { logger } from '../lib/logger.js';
import { updateStatus } from '../db/queries.js';
import { query } from '../db/pool.js';
import { callGroq } from '../lib/groq.js';
import { sendEmail } from '../lib/email.js';
import { config } from '../config/env.js';

// ── Status action map (Strategy Pattern) ──────────────────────────────
const COMMITMENT_ACTIONS = {
  commitment_confirm: { status: 'confirmed', emoji: '✅' },
  commitment_dismiss: { status: 'cancelled', emoji: '❌' },
  commitment_complete: { status: 'completed', emoji: '🎉' },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────

/** Build the shared draft-message payload (used after create + after edit). */
export function buildDraftPayload(
  commitmentId: string,
  subject: string,
  body: string,
  channel: string,
) {
  const text = `📧 *Draft*\n\n*To:* ${config.notificationEmail}\n*Subject:* ${subject}\n\n${body}`;
  return {
    channel,
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Edit Draft' },
            action_id: 'email_edit',
            value: commitmentId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📤 Send Email' },
            style: 'primary',
            action_id: 'email_send',
            value: commitmentId,
          },
        ],
      },
    ],
  };
}

/** Parse draft_email JSON column safely. */
export function parseDraftEmail(raw: string | null): { subject: string; body: string } {
  if (!raw) return { subject: '', body: '' };
  try {
    const parsed = JSON.parse(raw);
    return {
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
    };
  } catch {
    return { subject: '', body: '' };
  }
}

// ── Action handler ────────────────────────────────────────────────────

export async function registerActions(app: any) {
  // ====================================================================
  // 1. Main commitment action router (Confirm / Dismiss / Complete / Edit / Reassign)
  // ====================================================================
  app.action(/^commitment_/, async ({ ack, body: slackBody, client }: any) => {
    await ack();
    const actionId = slackBody.actions[0].action_id;
    const commitmentId = slackBody.actions[0].value;
    const userId = slackBody.user.id;
    const channelId = slackBody.container.channel_id;
    const messageTs = slackBody.container.message_ts;

    // ── Edit: open modal ──────────────────────────────────────────
    if (actionId === 'commitment_edit') {
      await openEditModal(client, slackBody.trigger_id, commitmentId);
      return;
    }

    // ── Reassign: open user-picker modal ──────────────────────────
    if (actionId === 'commitment_reassign') {
      await openReassignModal(client, slackBody.trigger_id, commitmentId);
      return;
    }

    // ── Emergency: broadcast help request in channel ──────────────
    if (actionId === 'commitment_emergency') {
      await handleEmergency(client, channelId, messageTs, userId, commitmentId);
      return;
    }

    // ── Takeover: someone volunteers to take an emergency commitment ──
    if (actionId === 'commitment_takeover') {
      await handleTakeover(client, userId, commitmentId, channelId, messageTs);
      return;
    }

    // ── Confirm / Dismiss / Complete ──────────────────────────────
    const action = COMMITMENT_ACTIONS[actionId as keyof typeof COMMITMENT_ACTIONS];
    if (!action) {
      logger.warn({ actionId }, 'Unknown commitment action');
      return;
    }

    try {
      await updateStatus(commitmentId, action.status);
    } catch (error) {
      logger.error({ error, commitmentId, actionId }, 'Failed to update commitment status');
    }

    // Update the original message with confirmation
    try {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `*Commitment ${action.status}* ${action.emoji}`,
      });
    } catch (error) {
      logger.error({ error, commitmentId }, 'Failed to update message after action');
    }

    // ── Completion flow: generate AI draft + post to user DM ──────
    if (actionId === 'commitment_complete') {
      await handleCompletion(client, userId, commitmentId);
    }
  });

  // ====================================================================
  // 2. Email draft modal (open)
  // ====================================================================
  app.action('email_edit', async ({ ack, body: slackBody, client }: any) => {
    await ack();
    await openEmailEditModal(client, slackBody.trigger_id, slackBody.actions[0].value);
  });

  // ====================================================================
  // 3. Email send button
  // ====================================================================
  app.action('email_send', async ({ ack, body: slackBody, client }: any) => {
    await ack();
    await handleSendEmail(
      client,
      slackBody.container.channel_id,
      slackBody.container.message_ts,
      slackBody.actions[0].value,
      slackBody.user.id,
    );
  });

  // ====================================================================
  // 5. View submissions (modal callbacks)
  // ====================================================================

  // Edit commitment modal
  app.view('commitment_edit_submit', async ({ ack, body: viewBody }: any) => {
    await ack();
    await handleEditCommitmentSubmit(viewBody);
  });

  // Reassign commitment modal
  app.view('commitment_reassign_submit', async ({ ack, body: viewBody }: any) => {
    await ack();
    await handleReassignSubmit(viewBody);
  });

  // Edit email draft modal
  app.view('email_edit_submit', async ({ ack, body: viewBody, client }: any) => {
    await ack();
    await handleEmailEditSubmit(client, viewBody);
  });
}

// =========================================================================
// Internal handlers (extracted for testability & readability)
// =========================================================================

/** Open the "Edit Commitment" modal. */
async function openEditModal(client: any, triggerId: string, commitmentId: string) {
  try {
    const result = await query<{ task_description: string; deadline: Date | null }>(
      'SELECT task_description, deadline FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (result.rows.length === 0) return;
    const { task_description, deadline } = result.rows[0];

    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'commitment_edit_submit',
        private_metadata: commitmentId,
        title: { type: 'plain_text', text: 'Edit Commitment' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'task_block',
            label: { type: 'plain_text', text: 'Task' },
            element: {
              type: 'plain_text_input',
              action_id: 'task_input',
              initial_value: task_description,
              multiline: true,
            },
          },
          {
            type: 'input',
            block_id: 'deadline_block',
            label: { type: 'plain_text', text: 'Deadline (YYYY-MM-DD HH:MM)' },
            element: {
              type: 'plain_text_input',
              action_id: 'deadline_input',
              initial_value: deadline
                ? new Date(deadline).toISOString().slice(0, 16).replace('T', ' ')
                : '',
            },
            optional: true,
          },
        ],
      },
    });
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to open edit modal');
  }
}

/** Open the "Reassign Commitment" user-picker modal. */
async function openReassignModal(client: any, triggerId: string, commitmentId: string) {
  try {
    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'commitment_reassign_submit',
        private_metadata: commitmentId,
        title: { type: 'plain_text', text: 'Reassign Commitment' },
        submit: { type: 'plain_text', text: 'Reassign' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Select the new owner for this commitment:' },
          },
          {
            type: 'input',
            block_id: 'user_block',
            label: { type: 'plain_text', text: 'New Owner' },
            element: { type: 'users_select', action_id: 'user_select' },
          },
        ],
      },
    });
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to open reassign modal');
  }
}

/** Generate an AI completion draft + post to user DM + public celebration. */
export async function handleCompletion(client: any, userId: string, commitmentId: string) {
  try {
    const dbResult = await query<{ task_description: string; channel_id: string }>(
      'SELECT task_description, channel_id FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (dbResult.rows.length === 0) return;
    const { task_description: task, channel_id } = dbResult.rows[0];

    // ── AI draft ──────────────────────────────────────────────────
    const groqResponse = await callGroq({
      system:
        'You are a professional assistant. Write a brief completion email. Use the sender name as Shubham Bhattacharya and recipient as Team Lead. No placeholders. Write in first person. 3-4 sentences. Return ONLY JSON: {"subject":"...","body":"..."}',
      user: `Write a completion email for: "${task}"`,
      temperature: 0.3,
    });

    const fallbackSubject = `Done: ${task}`;
    const fallbackBody = `Task "${task}" is complete.`;
    const draft = parseGroqDraft(groqResponse, fallbackSubject, fallbackBody);

    await query('UPDATE commitments SET draft_email = $1 WHERE id = $2', [
      JSON.stringify(draft),
      commitmentId,
    ]);

    // ── DM draft to user ──────────────────────────────────────────
    await client.chat.postMessage(
      buildDraftPayload(commitmentId, draft.subject, draft.body, userId),
    );

    // ── Public celebration in channel ─────────────────────────────
    try {
      await client.chat.postMessage({
        channel: channel_id,
        text: `🎉 <@${userId}> completed: "${task}" — great work! 🎉`,
      });
    } catch (msgError) {
      logger.error({ error: msgError }, 'Failed to post public celebration');
    }

    // ── Delete scheduler nudge message if exists ──────────────────
    try {
      const nudgeResult = await query<{ channel_id: string; reminder_ts: string }>(
        `SELECT channel_id, reminder_ts FROM commitments WHERE id = $1`,
        [commitmentId],
      );
      if (nudgeResult.rows[0]?.reminder_ts) {
        await client.chat.delete({
          channel: nudgeResult.rows[0].channel_id,
          ts: nudgeResult.rows[0].reminder_ts,
        });
      }
    } catch (delError) {
      logger.warn({ delError }, 'Could not delete nudge message (may not exist)');
    }

    logger.info({ task, commitmentId }, 'Completion draft generated and posted');
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to generate completion draft');
    try {
      await client.chat.postMessage({
        channel: userId,
        text: `⚠️ AI draft generation failed. The commitment is marked complete but no email draft was created. You can still send an email manually.`,
      });
    } catch (dmError) {
      logger.error({ error: dmError }, 'Failed to send error notification DM');
    }
  }
}

/** Parse a Groq JSON response into { subject, body } safely. */
export function parseGroqDraft(
  raw: string,
  fallbackSubject: string,
  fallbackBody: string,
): { subject: string; body: string } {
  try {
    const parsed = JSON.parse(raw || '{}');
    return {
      subject: parsed.subject || fallbackSubject,
      body: parsed.body || fallbackBody,
    };
  } catch {
    return { subject: fallbackSubject, body: fallbackBody };
  }
}

/** Open the "Edit Email Draft" modal. */
async function openEmailEditModal(client: any, triggerId: string, commitmentId: string) {
  try {
    const dbResult = await query<{ draft_email: string | null; task_description: string }>(
      'SELECT draft_email, task_description FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (dbResult.rows.length === 0) return;

    const draft = parseDraftEmail(dbResult.rows[0].draft_email);

    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'email_edit_submit',
        private_metadata: commitmentId,
        title: { type: 'plain_text', text: 'Edit Email' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'subject_block',
            label: { type: 'plain_text', text: 'Subject' },
            element: {
              type: 'plain_text_input',
              action_id: 'subject_input',
              initial_value: draft.subject || '',
            },
          },
          {
            type: 'input',
            block_id: 'body_block',
            label: { type: 'plain_text', text: 'Email Body' },
            element: {
              type: 'plain_text_input',
              action_id: 'body_input',
              initial_value: draft.body || '',
              multiline: true,
            },
          },
        ],
      },
    });
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to open email edit modal');
  }
}

/** Actually send the email and update the Slack message. */
async function handleSendEmail(
  client: any,
  channelId: string,
  messageTs: string,
  commitmentId: string,
  userId: string,
) {
  try {
    const dbResult = await query<{ draft_email: string | null; task_description: string }>(
      'SELECT draft_email, task_description FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (dbResult.rows.length === 0) return;

    const draft = parseDraftEmail(dbResult.rows[0].draft_email);
    const subject = draft.subject || `Done: ${dbResult.rows[0].task_description}`;
    const body = draft.body || `Task "${dbResult.rows[0].task_description}" is complete.`;

    // Use the shared email module instead of creating a raw transport
    await sendEmail({
      to: config.notificationEmail,
      subject,
      body,
    });

    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      text: `✅ *Email sent!*\n\n*To:* ${config.notificationEmail}\n*Subject:* ${subject}`,
    });

    logger.info({ commitmentId, subject }, 'Email sent via Send button');
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to send email from Send button');
    try {
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Email send failed. Please try again or check SMTP config.`,
      });
    } catch (dmError) {
      logger.error({ error: dmError }, 'Failed to send email error notification');
    }
  }
}

// =========================================================================
// Modal submission handlers (extracted for testability)
// =========================================================================

async function handleEditCommitmentSubmit(viewBody: any) {
  try {
    const values = viewBody.view.state.values;
    const newTask = values.task_block.task_input.value;
    const newDeadlineStr = values.deadline_block?.deadline_input?.value;
    const commitmentId = viewBody.view.private_metadata;

    let newDeadline: string | null = null;
    if (newDeadlineStr?.trim()) {
      const d = new Date(newDeadlineStr.trim());
      if (!isNaN(d.getTime())) {
        newDeadline = d.toISOString();
      }
    }

    await query('UPDATE commitments SET task_description = $1, deadline = $2 WHERE id = $3', [
      newTask,
      newDeadline,
      commitmentId,
    ]);

    logger.info({ commitmentId, newTask }, 'Commitment edited');
  } catch (error) {
    logger.error({ error }, 'Failed to save edited commitment');
  }
}

async function handleReassignSubmit(viewBody: any) {
  try {
    const values = viewBody.view.state.values;
    const newOwner = values.user_block.user_select.selected_user;
    const commitmentId = viewBody.view.private_metadata;

    await query('UPDATE commitments SET owner_id = $1 WHERE id = $2', [newOwner, commitmentId]);

    logger.info({ commitmentId, newOwner }, 'Commitment reassigned');
  } catch (error) {
    logger.error({ error }, 'Failed to reassign commitment');
  }
}

async function handleEmailEditSubmit(client: any, viewBody: any) {
  try {
    const values = viewBody.view.state.values;
    const newSubject = values.subject_block.subject_input.value;
    const newBody = values.body_block.body_input.value;
    const commitmentId = viewBody.view.private_metadata;

    await query('UPDATE commitments SET draft_email = $1 WHERE id = $2', [
      JSON.stringify({ subject: newSubject, body: newBody }),
      commitmentId,
    ]);

    // Post updated draft to user's DM
    try {
      await client.chat.postMessage(
        buildDraftPayload(commitmentId, newSubject, newBody, viewBody.user.id),
      );
    } catch (msgError) {
      logger.error({ error: msgError }, 'Failed to post updated draft');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to save edited draft');
  }
}

// =========================================================================
// Emergency flow handlers
// =========================================================================

/** Broadcast a help request in the channel when someone calls Emergency. */
export async function handleEmergency(
  client: any,
  channelId: string,
  messageTs: string,
  userId: string,
  commitmentId: string,
) {
  try {
    const result = await query<{ task_description: string }>(
      'SELECT task_description FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (result.rows.length === 0) return;
    const { task_description: task } = result.rows[0];

    // Update status to emergency
    await query("UPDATE commitments SET status = 'emergency' WHERE id = $1", [commitmentId]);

    // Update the original commitment card to show emergency state
    try {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: `🚨 *Emergency called on:* "${task}"`,
      });
    } catch (msgError) {
      logger.error({ error: msgError }, 'Failed to update original message on emergency');
    }

    // Broadcast help request in channel with a random attention emoji
    const alertEmoji = ['🔥', '🚨', '🆘'][Math.floor(Math.random() * 3)];
    await client.chat.postMessage({
      channel: channelId,
      text: `${alertEmoji} *Help needed!* <@${userId}> called an emergency on: "${task}" — anyone available to take this? 🙋`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${alertEmoji} *Help needed!* <@${userId}> called an emergency on:`,
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*"${task}"*` },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: "🙋 I'll take it!", emoji: true },
              style: 'primary',
              action_id: 'commitment_takeover',
              value: commitmentId,
            },
          ],
        },
      ],
    });

    logger.info({ commitmentId, userId, channelId }, 'Emergency called — help request broadcast');
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to handle emergency');
  }
}

/** Transfer ownership when someone clicks "I'll take it!". */
export async function handleTakeover(
  client: any,
  newOwnerId: string,
  commitmentId: string,
  channelId: string,
  broadcastTs: string,
) {
  try {
    const result = await query<{ task_description: string }>(
      'SELECT task_description FROM commitments WHERE id = $1',
      [commitmentId],
    );
    if (result.rows.length === 0) return;
    const { task_description: task } = result.rows[0];

    // Transfer ownership and reset to confirmed
    await query("UPDATE commitments SET owner_id = $1, status = 'confirmed' WHERE id = $2", [
      newOwnerId,
      commitmentId,
    ]);

    // Update the emergency broadcast message
    try {
      await client.chat.update({
        channel: channelId,
        ts: broadcastTs,
        text: `✅ *Claimed!* <@${newOwnerId}> has taken over this commitment! 🎉`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Claimed!* <@${newOwnerId}> has taken over: "${task}" 🎉`,
            },
          },
        ],
      });
    } catch (msgError) {
      logger.error({ error: msgError }, 'Failed to update broadcast on takeover');
    }

    // Celebrate the volunteer
    try {
      await client.chat.postMessage({
        channel: channelId,
        text: `💪 <@${newOwnerId}> stepped up to handle: "${task}" — thanks for owning it! 🙌`,
      });
    } catch (msgError) {
      logger.error({ error: msgError }, 'Failed to post takeover celebration');
    }

    logger.info({ commitmentId, newOwnerId }, 'Commitment taken over');
  } catch (error) {
    logger.error({ error, commitmentId }, 'Failed to handle takeover');
  }
}
