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

### 1. Commitment Detection (3-Checker Architecture)

```
Raw message received
        │
        ├── 1️⃣ REGEX PATTERNS (EN + HI independent)
        │       ├── English: strong (+3), soft (+1.5), deadline (+2), negation (→ reject)
        │       ├── Hindi:   strong (+3), soft (+1.5), deadline (+2), negation (→ reject)
        │       └── Both pattern sets fire on SAME text independently
        │           → Code-switching works because EN matches EN part, HI matches HI part
        │
        ├── 2️⃣ CHRONO-NODE
        │       └── Parse date from natural language
        │
        └── 3️⃣ GROQ AI FALLBACK (WIP — not yet wired in handler.ts)
                └── If regex score < threshold, fallback to LLM classification
```

**Scoring:**
| Score | Confidence |
|-------|-----------|
| ≥ 5 | high |
| 3-4 | medium |
| 1-2 | low |
| 0   | null (not detected) |

**Code-Switching Analysis (added Jul 10):**

| Input | English Score | Hindi Score | Total | Result | Notes |
|-------|:---:|:---:|:---:|:---:|---|
| "I'll fix login by EOD" | +3 (I'll) | 0 | 3+2=5 | ✅ High | Clean English |
| "Main fix kar dunga by 4PM" | 0 | +3 (fix kar dunga) | 3+2=5 | ✅ High | English `by 4PM` gives deadline bonus |
| "I'll fix kar dunga login bug kal subah" | +3 (I'll) | +3 (fix kar dunga) | 6+2=8 | ✅ High | Both patterns fire |
| **"Main fix karunga by 4PM"** | **0** | **0** | **0** | **❌ Miss** | **karunga is contraction of kar dunga — not in patterns** |
| **"I'll karta hoon by EOD"** | **+3 (I'll)** | **0** | **3+2=5** | **✅ Detected but wrong** | **Calls it a commitment but `karta hoon` = "I do" not "I will do"** |

**Known Gaps to Fix (Priority Order):**
1. Add contracted Hinglish verb forms: `karunga/karoonga/karungi/karongi`
2. Wire Groq AI fallback in handler.ts (3-checker not fully connected)
3. Lower AI threshold for mixed-language inputs (regex score 0-3 → always send to AI)
4. Add mid-sentence hybrid patterns: `\b(I|I'll)\b.*\b(?:karna|karunga|karungi|karega)\b`

**Replied on X Jul 10:** @afanazizoutbind identified code-switching edge case. Thread kept open for more test examples.

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

## 4-Day Ship Plan (Revised Jul 10)

| Day | Build | Time Needed | WOW |
|-----|-------|:-----------:|:---:|
| **Sat Jul 11** | 1. Scheduler (30s check loop, sends warning 30min before due) | 1.5h | 🔥🔥🔥 |
| | 2. Complete button | 0.5h | 🔥🔥 |
| | 3. Emergency + Reassign button (🚨 → auto-post in channel → "I'll take it" → ownership transfer) | 2h | 🔥🔥🔥 |
| **Sun Jul 12** | 4. Wire Groq AI fallback (3-checker complete) | 1h | 🔥🔥 |
| | 5. Fix code-switching gaps (contracted Hinglish patterns) | 30min | 🔥 |
| | 6. Overdue public post | 1h | 🔥🔥 |
| | 7. MCP server (GET /mcp/tools, POST /mcp/commitments) | 1h | 🔥 |
| **Mon Jul 13** | 8. Demo video (90-sec screen recording) | 1h | 🔥🔥🔥 |
| | 9. Devpost submission | 30min | 🔥🔥🔥 |
| | 10. Slash `/what` command (if time) | 1h | 🔥 |

**Total build time: ~8 hours. Available: ~18 hours. ✅ Plenty of room.**

### What NOT to Build (Distractions)
| Idea | Why Skip |
|---|---|
| WhatsApp alerts | Not Slack-native. Judges don't care. 5+ days effort. |
| Chat bot ("ask what I need") | 4+ hours. Great for v2, bad for 4-day sprint. |
| Full web dashboard | Overkill for Slack bot hackathon. |
| Email notifications | No one opens them. Slack is where user is. |

### The Winning Flow (Build This Story)
```
1. User: "I'll fix login by Friday" → detected ✅ (bilingual EN/HI)
2. Bot saves + shows card with buttons ✅  DONE
3. User clicks Confirm ✅  DONE
4. Bot warns 30min before deadline in-channel ⬜  BUILD SAT
5. User hits Emergency → "Anyone available?" → reassigned ⬜  BUILD SAT
6. New owner Completes → bot congratulates publicly ⬜  BUILD SAT
7. Demo video shows all 6 steps ⬜  BUILD SUN
```

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
