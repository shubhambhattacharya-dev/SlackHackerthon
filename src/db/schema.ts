import { query } from './pool.js';
import { logger } from '../lib/logger.js';

const IS_DEV = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export async function initializeDatabase() {
  const sql = `CREATE TABLE IF NOT EXISTS commitments(
             id TEXT PRIMARY KEY,
                         slack_message_ts TEXT NOT NULL,
                         channel_id TEXT NOT NULL,
                         owner_id TEXT NOT NULL,
                         task_description TEXT NOT NULL,
                         deadline TIMESTAMPTZ,
                         status TEXT NOT NULL DEFAULT 'pending',
                         reminded_at TIMESTAMP,
                         reminder_ts TEXT,
                         draft_email TEXT,
                         created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  try {
    await query(sql);
    logger.info('Database initialised successfully');
    
    // Clear test data in development
    if (IS_DEV) {
      await query('DELETE FROM commitments');
      logger.info('Cleared commitments table (development mode)');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database');
    throw error;
  }
}
