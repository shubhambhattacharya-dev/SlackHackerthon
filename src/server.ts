import {App} from "@slack/bolt"
import {config} from "./config/env.js"
import {logger} from "./lib/logger.js"
import {handleMessage} from "./slack/handler.js"

const app=new App({
    token:config.slack.botToken,
    signingSecret:config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
})

app.message(handleMessage)

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

signals.forEach((signal) => {
    process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        await app.stop();

        process.exit(0);
    });
});

(async()=>{
    await app.start();
    logger.info("Amnesia Agent connected via Socket mode")
})();

