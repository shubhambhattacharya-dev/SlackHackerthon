import { query } from "./pool.js";
import {logger} from "../lib/logger.js";


export async function initializeDatabase(){
 
  const sql=`CREATE TABLE IF NOT EXISTS commitments(
             id TEXT PRIMARY KEY,
             slack_message_ts TEXT NOT NULL,
             channel_id TEXT NOT NULL,
             owner_id TEXT NOT NULL,
             task_description TEXT NOT NULL,
             deadline TIMESTAMPTZ,
             status TEXT NOT NULL DEFAULT 'pending',
             reminded_at TIMESTAMP,
             created_at TIMESTAMPTZ DEFAULT NOW()
  )`

  try {
    await query(sql);
    logger.info("Database initialised successfully");
    
  } catch (error) {
    logger.error({error},"Failed to initialize database");
    throw error;
  }
}