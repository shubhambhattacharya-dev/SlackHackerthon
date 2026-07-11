import {logger} from '../lib/logger.js'
import { markReminded, getDueSoon } from '../db/queries.js'


export function startSchedule(app:any){
    setInterval(async()=>{
        try {
            const dueSoon=await getDueSoon();
            for(const commitment of dueSoon){
              await  app.client.chat.postMessage({
                    channel:commitment.channel_id,
                    text: `Hey <@${commitment.owner_id}>, your task "${commitment.task_description}" is due soon! Please complete it by ${commitment.deadline?.toLocaleDateString()}`
                })
                await markReminded(commitment.id);

            }
            
            
            
        } catch (error) {
            logger.error({error}, "Error processing due soon commitments");

            
        }

    },30000)

}