import {App} from "@slack/bolt"
import {config} from "./config/env.js"
import {logger} from "./lib/logger.js"
import {handleMessage} from "./slack/handler.js"
import {initializeDatabase} from './db/schema.js'
import { registerActions } from "./slack/actions.js"
import {startSchedule} from "./scheduler/nudge.js"

const app=new App({
    token:config.slack.botToken,
    signingSecret:config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
})

app.message(handleMessage)
registerActions(app)
startSchedule(app)


const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

signals.forEach((signal) => {
    process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        await app.stop();

        process.exit(0);
    });
});

(async()=>{
    await initializeDatabase()
    await app.start();
    logger.info("Amnesia Agent connected via Socket mode")
})();
