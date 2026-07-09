import "dotenv/config"
import {z} from 'zod'


const envSchema=z.object({
SLACK_BOT_TOKEN:z.string().startsWith('xoxb-'),
SLACK_SIGNING_SECRET:z.string().min(1),
SLACK_APP_TOKEN:z.string().startsWith('xapp-'),
GROQ_API_KEY:z.string().min(1),
GOOGLE_API_KEY:z.string().min(1),
OPENROUTER_API_KEY:z.string().min(1),
DATABASE_URL:z.string().startsWith('postgresql://'),
PORT:z.coerce.number().int().positive().default(3000),
GOOGLE_CALENDAR_API_KEY:z.string().min(1),
GOOGLE_CALENDAR_ID:z.string().min(1),
API_KEY:z.string().min(1),
MCP_ENABLED:z.coerce.boolean().default(true),
HOST:z.string().default('0.0.0.0'),
LOG_LEVEL:z.enum(["debug","info","warn","error"]).default("info"),
NODE_ENV:z.enum(["development","test","production"]).default("development")
})

    const parsed=envSchema.safeParse(process.env);
    if (!parsed.success) {
        throw new Error(`Invalid environment variables: ${JSON.stringify(parsed.error.format())}`);
    }

    export const config= {
        slack:{
            botToken:parsed.data.SLACK_BOT_TOKEN,
            signingSecret:parsed.data.SLACK_SIGNING_SECRET,
            appToken:parsed.data.SLACK_APP_TOKEN,
        },
        ai:{
            groqKey:parsed.data.GROQ_API_KEY,
            openRouterKey:parsed.data.OPENROUTER_API_KEY,
            googleKey:parsed.data.GOOGLE_API_KEY
        },
        calendar:{
            googleCalendarKey:parsed.data.GOOGLE_CALENDAR_API_KEY,
            googleCalendarId:parsed.data.GOOGLE_CALENDAR_ID
        },
        mcp:{
            apiKey:parsed.data.API_KEY,
            mcpEnabled:parsed.data.MCP_ENABLED,
        },

        db:{
            url:parsed.data.DATABASE_URL,
        },
        port:parsed.data.PORT,
        host:parsed.data.HOST,
        logLevel:parsed.data.LOG_LEVEL,
        nodeEnv:parsed.data.NODE_ENV
    }