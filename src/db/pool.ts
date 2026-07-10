import pg from 'pg'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'

const {Pool}=pg;

export const pool=new Pool({
    connectionString:config.db.url,
    max:10,
})

pool.on("error",(err)=>{
    logger.error({err},"Unexpected database pool error")
});

export async function query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: unknown[]
): Promise<pg.QueryResult<T>> {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await pool.query<T>(text, params);
        } catch (err) {
            if (attempt === MAX_RETRIES) throw err; // Last try? Give up.
            logger.warn({ err, attempt }, "Query failed, retrying...");
            await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s, 3s
        }
    }

    throw new Error("Unreachable");
}