import { query } from './pool.js';

export interface CreateCommitmentParams {
  id: string;
  slackMessageTs: string;
  channelId: string;
  ownerId: string;
  taskDescription: string;
  deadline?: Date;
}

export async function createCommitment(params: CreateCommitmentParams): Promise<void> {
  const sql = `INSERT INTO commitments(
    id,slack_message_ts,channel_id,owner_id,task_description,deadline,status) VALUES($1,$2,$3,$4,$5,$6,'pending')`;
  await query(sql, [
    params.id,
    params.slackMessageTs,
    params.channelId,
    params.ownerId,
    params.taskDescription,
    params.deadline ?? null,
  ]);
}

export async function updateStatus(id: string, status: string): Promise<void> {
  await query(`UPDATE commitments SET status = $1 WHERE id = $2`, [status, id]);
}

export async function updateDeadline(id: string, deadline: Date): Promise<void> {
  await query(`UPDATE commitments SET deadline = $1 WHERE id = $2`, [deadline, id]);
}
