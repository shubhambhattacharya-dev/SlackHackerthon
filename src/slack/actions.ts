import {logger} from '../lib/logger.js'
import { updateStatus } from '../db/queries.js';


const actions={
    commitment_confirm:{status:"confirmed", emoji:"✅"},
    commitment_dismiss:{status: "cancelled", emoji:"❌" },
}as const; 


export async function registerActions(app:any){
    app.action(/^commitment_/, async({ack,body,client}:any)=>{
        await ack();
        const actionId=body.actions[0].action_id;
        const action = actions[actionId as keyof typeof actions];
        if (!action) {
            return;
        }
        
        try {
            await updateStatus(body.actions[0].value, action.status);
        } catch (error) {
            logger.error({ error }, "Failed to update commitment status");
        }
    
        try {
            await client.chat.update({
                channel: body.container.channel_id,
                ts: body.container.message_ts,
                text: `*Commitment ${action.status}* ${action.emoji}`,
            });
        } catch (error) {
            logger.error({ error }, "Failed to update message");
        }
    });
}