EXCELLENT RESEARCH. Your analysis is thorough and validated.
VERDICT: Build Amnesia Agent
Metric	Score	Status
Pain Level	9/10	✅
Competition	8/10 (low)	✅ GREEN LIGHT
Buildable	9/10	✅
Judge Appeal	9/10	✅
Tech Fit	10/10	✅
TOTAL	45/50	🏆 WINNER
VALIDATION CONFIRMED
Query	GitHub	Devpost
"Amnesia Slack Agent"	0 repos	0 projects
"Decision Ledger Slack"	0 repos	0 projects
"Commitment Tracker Slack"	0 repos	0 projects
Zero competition. You're first.
EXACT USER QUOTE (Use in demo)
"Someone proposes something. 4 people react with 👍. Everyone agrees. Then the decision quietly floats away because nobody was tagged as the person who has to move it."
WHAT YOU'RE BUILDING
Slack conversation happens
        ↓
Agent detects commitment: "I'll upload the schema by 4 PM"
        ↓
Agent posts verification card:
"I detected a commitment:
- Owner: @shubhamb
- Task: Upload DB schema
- Due: Today 4:00 PM
[Confirm] [Edit] [Dismiss]"
        ↓
If confirmed → tracked in Canvas + nudged at 3:30 PM
SLASH COMMANDS
Command	What it does
/what	Show all active commitments in this channel
/how	Show context + files for a specific decision
/why	Explain reasoning behind a decision
7-DAY BUILD PLAN
Day	Task
1	Slack CLI + Nitro server setup
2	Intent classification (Claude 3.5)
3	Block Kit verification cards
4	PostgreSQL + Canvas ledger
5	Durable workflow nudges
6	Slash commands (/what, /how, /why)
7	Testing + demo video
Total: ~34 hours
TECH STACK
Component	Technology
Runtime	Node.js + Express
Agent Framework	Bolt SDK
LLM	Groq / OpenRouter / Google Gemini (free)
MCP	Slack Native MCP
Database	PostgreSQL
UI	Block Kit + Canvas API

PRODUCTION FILE STRUCTURE
SlackHackerthon/
├── src/
│   ├── config.ts              ← Environment variables
│   ├── server.ts              ← Express + Bolt entry point
│   ├── slack/
│   │   └── handler.ts         ← Message events
│   ├── ai/
│   │   ├── llm.ts             ← Groq/OpenRouter/Gemini fallback
│   │   └── tools.ts           ← Commitment detection
│   ├── db/
│   │   └── pool.ts            ← PostgreSQL connection
│   ├── observability/
│   │   └── tracker.ts         ← Token/latency tracking
│   └── routes/
│       └── api.ts             ← Slash commands + API
├── .env.example               ← Template for secrets
├── .env                       ← Real secrets (not committed)
├── .gitignore                 ← Files to ignore
├── tsconfig.json              ← TypeScript config
├── package.json               ← Dependencies + scripts
└── README.md                  ← Documentation

ROOT FOLDER = Config files only
src/ FOLDER = All source code
THIS IS IT
Why it wins	Proof
Zero competition	GitHub + Devpost = 0 results
Real user pain	15+ independent mentions
Uses all 3 technologies	MCP + RTS + Slack AI
Judges will care	Solves #1 workflow problem
Start building NOW:
slack create agent
You have 7 days. This is the winner. Go.

Day 1 is just:
- Create Slack app
- Enable MCP
- Get tokens
- Connect bot
That's 30 minutes.
The rest (Days 2-7):
- Day 2: Commitment detector (AI logic)
- Day 3: Block Kit cards (UI)
- Day 4: PostgreSQL database
- Day 5: Nudge system
- Day 6: Slash commands
- Day 7: Testing + demo
Day 1 = 30 min setup
Full project = 7 days