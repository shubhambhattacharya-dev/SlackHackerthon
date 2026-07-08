# Amnesia Agent — Project Plan

## Problem Statement

Teams make decisions in Slack every day. Someone says "I'll handle it." Everyone agrees. Then the commitment disappears in the chat history. No one tracks it. No one follows up. Work falls through the cracks.

**Amnesia Agent** detects commitments in Slack messages, confirms them with users, tracks deadlines, and sends reminders before due time.

---

## Solution Overview

```
User posts commitment in Slack
        ↓
Agent detects commitment (AI + NLP hybrid)
        ↓
Agent posts verification card
        ↓
User confirms / dismisses
        ↓
Agent tracks in database
        ↓
Agent sends warning 30 min before due
        ↓
User completes or cancels
```

---

## Hackathon Context

- **Competition**: Slack Agent Builder Challenge
- **Deadline**: July 14, 2026
- **Prize Pool**: $42,000
- **Required Technologies**: Slack AI, MCP, Real-Time Search API (using all 3)
- **Track**: New Slack Agent

---

## Tech Stack

| Component | Technology | Reason |
|-----------|------------|--------|
| Runtime | Node.js + TypeScript | Type safety, fast development |
| Agent Framework | @slack/bolt | Official Slack SDK |
| Connection | Socket Mode | No public URL needed |
| LLM | Groq (primary) | Fast inference, free tier |
| LLM Fallback | Google Gemini | Backup if Groq fails |
| NLP | natural | Text processing, tokenization |
| Date Parsing | chrono-node | Extract dates from natural language |
| Database | PostgreSQL | Persistent storage |
| DB Client | pg (node-postgres) | Mature, reliable |
| Validation | Zod | Runtime type checking |
| Logging | pino | Fast, structured logs |
| Security | helmet, cors | HTTP headers, CORS |
| UUID | uuid | Unique commitment IDs |

---

## Architecture Pattern

**Pattern**: Modular Monolith

```
src/
├── config/          ← Environment validation
├── lib/             ← Shared utilities
├── slack/           ← Slack-specific logic
├── ai/              ← LLM integration
├── db/              ← Database queries
├── nlp/             ← Text processing
├── scheduler/       ← Timed tasks
└── server.ts        ← Entry point
```

**Why monolith for hackathon:**
- Fast to build
- Easy to debug
- No network calls between services
- Can refactor to microservices later

---

## Design Principles

1. **Single Responsibility**: Each file does one thing
2. **Fail Fast**: Validate config at startup
3. **Graceful Degradation**: If LLM fails, use NLP fallback
4. **No Secrets in Code**: All secrets in .env
5. **Structured Logging**: Every action logged with context
6. **Error Boundaries**: Catch errors, don't crash

---

## Data Flow

### 1. Commitment Detection

```
Message event received
        ↓
Extract: text, user_id, channel_id, message_ts
        ↓
chrono-node: Extract due time
        ↓
LLM: Classify intent (commitment / non-commitment)
        ↓
If commitment detected:
  ├── Generate commitment object
  ├── Store as "pending"
  └── Post verification card
```

### 2. Verification

```
User clicks [Confirm]
  ├── Update status: pending → confirmed
  ├── Store in database
  └── Schedule warning (due_time - 30min)

User clicks [Dismiss]
  └── Delete commitment
```

### 3. Reminder System

```
Timer fires (30 min before due)
  ├── Fetch commitment from DB
  ├── Check status (still confirmed?)
  ├── Send warning card
  └── Schedule overdue check (at due_time)

Timer fires (at due_time)
  ├── Check if completed
  ├── If not: send overdue card
  └── Update status: confirmed → overdue
```

### 4. Message Updates

```
message_changed event
  ├── Find commitment by message_ts
  ├── If exists: re-analyze new text
  ├── Update due_time if changed
  └── Cancel if commitment removed
```

### 5. Completion Detection

**Production approach: Multiple signals combined**

| Signal | Weight | Source | Example |
|--------|--------|--------|---------|
| Button click | 1.0 (100%) | action | User clicks [Done] |
| Keywords | 0.7 (70%) | message | "done", "completed", "ho gaya" |
| Emoji reaction | 0.6 (60%) | reaction | ✅ on original message |
| Thread reply | 0.4 (40%) | thread | "finished" in thread |

**State Machine:**
```
pending → confirmed → reminded → completed
                    → cancelled
                    → overdue
                    → reactivated (if reopened)
```

**Completion Detection Logic:**
```
User action received
        ↓
Identify signal type (button/keyword/emoji)
        ↓
Calculate confidence score
        ↓
If score >= 0.7 → Mark as completed
        ↓
Update database status
        ↓
Send confirmation card
```

**MVP Implementation:**
- Button click only (simplest, most reliable)
- Add keywords later if time permits

---

## Database Schema

```sql
CREATE TABLE commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_message_ts TEXT UNIQUE NOT NULL,
  channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  due_time TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE commitment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID REFERENCES commitments(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Status Values

```
pending    → Detected, awaiting confirmation
confirmed  → User confirmed
completed  → User marked done
cancelled  → User dismissed
overdue    → Past due time, not completed
```

---

## Slack Events Used

| Event | Purpose |
|-------|---------|
| message | Detect commitments in channels |
| message_changed | Handle edits |
| message_deleted | Handle deletions |
| reaction_added | Optional: detect 👍 reactions |
| app_mention | Handle direct mentions |

---

## Block Kit Cards

### 1. Verification Card
```
┌─────────────────────────────────┐
│ 🎯 Commitment Detected         │
│                                 │
│ Owner: @shubhamb                │
│ Task: Upload DB schema          │
│ Due: Today 4:00 PM             │
│                                 │
│ [Confirm]  [Edit]  [Dismiss]   │
└─────────────────────────────────┘
```

### 2. Warning Card
```
┌─────────────────────────────────┐
│ ⏰ Reminder                     │
│                                 │
│ You committed to:               │
│ "Upload DB schema"              │
│ Due in: 30 minutes              │
│                                 │
│ [Done]  [Skip]                  │
└─────────────────────────────────┘
```

### 3. Overdue Card
```
┌─────────────────────────────────┐
│ ⚠️ Overdue                      │
│                                 │
│ This commitment is past due:    │
│ "Upload DB schema"              │
│ Was due: 4:00 PM                │
│                                 │
│ [Done]  [Skip]                  │
└─────────────────────────────────┘
```

---

## Slash Commands

| Command | Description | MVP? |
|---------|-------------|------|
| /what | Show active commitments in channel | ✅ |
| /how | Show context for a commitment | ❌ Day 6 |
| /why | Explain decision reasoning | ❌ Day 6 |

---

## Error Handling Strategy

```
LLM fails → Use NLP fallback
Database fails → Log error, don't crash
Slack API fails → Retry once, then log
Invalid config → Exit process with error
```

---

## Logging Format

```json
{
  "level": "info",
  "time": "2026-07-07T12:00:00.000Z",
  "msg": "Commitment detected",
  "channelId": "C123456",
  "userId": "U123456",
  "dueTime": "2026-07-07T16:00:00.000Z"
}
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| SLACK_BOT_TOKEN | Bot authentication | ✅ |
| SLACK_SIGNING_SECRET | Request verification | ✅ |
| SLACK_APP_TOKEN | Socket Mode connection | ✅ |
| GROQ_API_KEY | Primary LLM | ✅ |
| GOOGLE_API_KEY | Fallback LLM | ✅ |
| DATABASE_URL | PostgreSQL connection | ✅ |
| PORT | Server port | Optional |
| LOG_LEVEL | Logging verbosity | Optional |
| NODE_ENV | Environment mode | Optional |

---

## Security Checklist

- [ ] .env not committed to git
- [ ] No secrets in source code
- [ ] Helmet HTTP headers enabled
- [ ] CORS configured
- [ ] Input validation on all events
- [ ] Rate limiting (future)

---

## Performance Considerations

| Concern | Solution |
|---------|----------|
| LLM latency | Use Groq (fast inference) |
| Database queries | Index on channel_id, status |
| Memory leaks | Clear timers on commitment complete |
| Concurrent events | Node.js event loop handles it |

---

## 7-Day Build Plan

| Day | Task | Files | Status |
|-----|------|-------|--------|
| 1 | Project setup, Slack app, env config | config/, lib/ | ✅ Done |
| 2 | Server entry, Bolt connection, message handler, commitment detection | server.ts, slack/, ai/ | ✅ Done |
| 3 | Verification cards, Block Kit, completion detection | slack/cards.ts | ⏳ Next |
| 4 | Database, CRUD operations | db/ | ❌ |
| 5 | Reminder system, timers | scheduler/ | ❌ |
| 6 | Slash commands, testing | routes/ | ❌ |
| 7 | Demo video, submit to Devpost | - | ❌ |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Detection accuracy | 80%+ |
| Response time | < 2 seconds |
| Demo duration | < 3 minutes |
| Features working | Core flow complete |

---

## Backup Plan

If LLM fails or is too slow:
1. Use chrono-node for date extraction only
2. Use keyword matching for intent detection
3. "I'll", "I will", "I can", "I'm going to" → commitment keywords
4. Completion keywords: "done", "completed", "finished", "ho gaya", "kar diya"

This is the fallback. LLM is primary.

---

## Completion Detection Patterns

**English Keywords:**
```
done, completed, finished, wrapped, shipped, pushed, delivered
```

**Hindi/Hinglish Keywords:**
```
ho gaya, ho gaya hai, kar diya, kar diya hai, done kar diya
```

**Button Actions:**
```
[Done] → Status: completed
[Skip] → Status: cancelled
[Extend] → Status: rescheduled (future feature)
```

---

## Deployment

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | localhost:3000 | Local testing |
| Demo | Slack workspace | Judging |

---

## What Wins This Hackathon

1. **Real pain point** — Teams lose commitments daily
2. **Zero competition** — No existing solution
3. **Clean UX** — One-click confirm, one-click complete
4. **Working demo** — judges see it work live
5. **Technical depth** — AI + NLP + Database + Scheduler

---

## Next Steps

1. Fix 3 config issues
2. Build src/server.ts
3. Build src/slack/handler.ts
4. Build src/ai/llm.ts
5. Build src/ai/tools.ts (commitment detection)
6. Build src/slack/cards.ts (Block Kit)
7. Build src/db/pool.ts
8. Build src/db/queries.ts
9. Build src/scheduler/nudge.ts
10. Test end-to-end
11. Record demo video
12. Submit to Devpost
