import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

interface Commitment {
  id: string;
  owner_id: string;
  task_description: string;
  status: string;
  deadline: string | null;
  created_at: string;
}

const STATUS_EMOJI: Record<string, string> = {
  pending: '⏳',
  confirmed: '✅',
  completed: '🎉',
  cancelled: '❌',
  overdue: '🔴',
};

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'no deadline';
  const d = new Date(deadline);
  const now = new Date();
  const diff = d.getTime() - now.getTime();

  if (diff < 0) return '⚠️ OVERDUE';
  if (diff < 3600000) return `${Math.ceil(diff / 60000)}m left`;
  if (diff < 86400000) return `${Math.ceil(diff / 3600000)}h left`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export async function getDashboardSummary(): Promise<string> {
  try {
    const result = await query<Commitment>(
      `SELECT id, owner_id, task_description, status, deadline, created_at
       FROM commitments
       ORDER BY
         CASE status
           WHEN 'pending' THEN 1
           WHEN 'confirmed' THEN 2
           WHEN 'completed' THEN 3
           WHEN 'cancelled' THEN 4
           ELSE 5
         END,
         created_at DESC
       LIMIT 50`,
    );

    if (result.rows.length === 0) {
      return '📋 *No commitments yet.* Send a message like "I\'ll finish the report by 5 PM" to get started!';
    }

    // Group by status
    const grouped: Record<string, Commitment[]> = {};
    for (const row of result.rows) {
      const status = row.status || 'pending';
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(row);
    }

    const lines: string[] = ['📋 *Commitment Dashboard*\n'];

    // Summary counts
    const total = result.rows.length;
    const completed = grouped.completed?.length || 0;
    const pending = (grouped.pending?.length || 0) + (grouped.confirmed?.length || 0);
    const cancelled = grouped.cancelled?.length || 0;

    lines.push(
      `*${total}* total · *${completed}* completed · *${pending}* active · *${cancelled}* dismissed\n`,
    );

    // Active commitments (pending + confirmed)
    const active = [...(grouped.pending || []), ...(grouped.confirmed || [])];

    if (active.length > 0) {
      lines.push('*🔥 Active:*');
      for (const c of active.slice(0, 10)) {
        const emoji = STATUS_EMOJI[c.status] || '⏳';
        const deadline = formatDeadline(c.deadline);
        lines.push(`  ${emoji} <@${c.owner_id}> — ${c.task_description} _(${deadline})_`);
      }
      if (active.length > 10) {
        lines.push(`  _...and ${active.length - 10} more_`);
      }
      lines.push('');
    }

    // Completed
    if (grouped.completed?.length) {
      lines.push('*🎉 Completed:*');
      for (const c of grouped.completed.slice(0, 5)) {
        lines.push(`  ✅ <@${c.owner_id}> — ${c.task_description}`);
      }
      if (grouped.completed.length > 5) {
        lines.push(`  _...and ${grouped.completed.length - 5} more_`);
      }
      lines.push('');
    }

    // Dismissed
    if (grouped.cancelled?.length) {
      lines.push(`*❌ Dismissed:* ${grouped.cancelled.length}`);
    }

    return lines.join('\n');
  } catch (error) {
    logger.error({ error }, 'Failed to generate dashboard');
    return '⚠️ Failed to load dashboard. Please try again.';
  }
}
