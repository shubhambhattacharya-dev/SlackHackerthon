# Amnesia Agent - Development Log

## Day 1: Project Setup + Slack Connection ✅

### Completed
- Created Slack app "Amnesia Agent"
- Added 10 OAuth scopes (chat:write, channels:history, etc.)
- Installed app to workspace
- Obtained Bot Token (xoxb-...) and Signing Secret
- Created .env.example with all required variables
- Created .env with real tokens
- Created .gitignore
- Created tsconfig.json (production-grade)
- Created package.json with scripts (dev, build, start, watch)
- Installed dependencies: @slack/bolt, express, zod, pino, etc.
- Created src/config/env.ts with Zod validation
- Created src/lib/logger.ts with Pino

---

## Day 2: Server Connection + Commitment Detection ✅

### Completed
- Fixed config issues (package.json main, LOG_LEVEL casing, port parsing)
- Added SLACK_APP_TOKEN to env.ts and .env.example
- Created src/server.ts with Bolt + Socket Mode
- Implemented graceful shutdown (SIGINT, SIGTERM)
- Created src/slack/handler.ts for message events
- Created src/ai/tools.ts with hybrid commitment detection
- Added text normalization for typo handling
- Added question detection (avoids false positives)
- Added third-party detection (avoids detecting others' commitments)
- Added Hinglish deadline resolver (chrono can't parse Hindi time)
- Added scoring system (high/medium/low confidence)
- Added negation patterns (Hindi + English)
- Tested commitment detection with multiple languages

### Files Created/Modified
```
src/server.ts          ← Bolt + Socket Mode entry
src/slack/handler.ts   ← Message event handler
src/ai/tools.ts        ← Commitment detection engine
src/config/env.ts      ← Added SLACK_APP_TOKEN
.env                   ← Added SLACK_APP_TOKEN
```

### Test Results
| Message | Expected | Actual | Status |
|---------|----------|--------|--------|
| "I'll upload by 4 PM" | Commitment | Detected (high) | ✅ |
| "Meeting at 4 PM" | No commitment | Echo | ✅ |
| "I can't finish by tomorrow" | No commitment | Echo | ✅ |
| "on it, sending rn" | Commitment | Detected (high) | ✅ |
| "bet, kar deta hoon abhi" | Commitment | Detected (high) | ✅ |
| "ho jayega bhai, meeting se pehle" | Commitment | Detected (high) | ✅ |
| "idk if i can, maybe later" | No commitment | Echo | ✅ |
| "kya tu ye karodega?" | No commitment | Echo | ✅ |
| "He will finish it tomorrow" | No commitment | Echo | ✅ |

### Patterns Implemented
**English Strong:** I'll, I will, I'm going to, bet, on it, sending, shipping, etc.
**English Soft:** trying to, lmk, wip, almost there, will try
**English Deadline:** rn, asap, eod, cob, tonight, shortly
**Hindi Strong:** kar deta hoon, ho jayega, bhej raha hoon, done kar dunga
**Hindi Soft:** try karta hoon, list me hai, baad me karta hoon
**Hindi Deadline:** abhi, thodi der me, kal subah, shaam tak
**Negations (EN):** can't, won't, no promises, maybe later
**Negations (HI):** nahi ho payega, mushkil hai, abhi nahi

### Issues Resolved
1. ESM import issues → Switched from ts-node to tsx
2. Socket Mode not receiving events → Enabled in Slack dashboard
3. Bot not showing in channel → Reinstalled app, enabled Messages tab
4. False positives on questions → Added isQuestion() filter
5. False positives on third-party → Added isThirdParty() filter
6. Hinglish time parsing → Added resolveHinglishTime()

### What We Learned
1. Socket Mode uses WebSocket, not HTTP (no port needed)
2. App Token authenticates WebSocket, Bot Token authenticates API calls
3. OAuth Scopes = permissions (what bot can do)
4. Slack free plan has app limitations
5. chrono-node can't parse Hindi time expressions
6. Regex patterns are faster than NLP libraries for hackathon

---

## Day 3: Verification Card + Block Kit 🔄

### Planned
- Build Block Kit verification card
- Add [Confirm] [Edit] [Dismiss] buttons
- Implement button action handlers
- Add completion detection (button click)
- Create card templates for warning and overdue

### Next (Day 4)
- PostgreSQL database setup
- CRUD operations for commitments
- Database migrations

---

## Day 4: Database

### Planned
- PostgreSQL connection pool
- Create commitments table
- Create commitment_logs table
- CRUD operations (create, read, update, delete)
- Query by channel, user, status

---

## Day 5: Reminder System

### Planned
- Timer-based nudge system
- Warning card (30 min before due)
- Overdue card (after due time)
- Completion detection

---

## Day 6: Slash Commands + Testing

### Planned
- /what - Show active commitments
- /how - Show context
- /why - Explain reasoning
- End-to-end testing

---

## Day 7: Demo + Submit

### Planned
- Record demo video (< 3 minutes)
- Create Devpost submission
- Architecture diagram
- Final testing
- Submit to hackathon

---

## Key Learnings

### Backend Engineering
1. **Fail Fast** - Validate config at startup
2. **Single Responsibility** - Each file does one thing
3. **Structured Logging** - Every action logged with context
4. **Graceful Shutdown** - Handle SIGINT/SIGTERM
5. **Error Boundaries** - Catch errors, don't crash

### Slack Development
1. **Socket Mode** - Best for hackathon (no ngrok)
2. **OAuth Scopes** - Minimal permissions principle
3. **Block Kit** - UI components for cards
4. **Event Subscriptions** - What bot can receive
5. **App Token vs Bot Token** - Different purposes

### Hackathon Strategy
1. **Build MVP first** - Features later
2. **Test as you go** - Don't wait until end
3. **One file at a time** - Avoid overwhelm
4. **Document progress** - Helps with demo
5. **Focus on core flow** - Edge cases later
