# Amnesia Agent — Build Status

## ✅ Fixed Today
- [x] Created `src/slack/cards/detection.ts` — Block Kit detection card with Confirm/Edit/Dismiss
- [x] Fixed `warning.ts` — removed unused uuid import
- [x] Fixed `env.ts` — syntax error on line 44
- [x] Fixed `handler.ts` — message type narrowing, logger argument order, added missing `.blocks`
- [x] Fixed `tsconfig.json` — excluded test/eval files from build
- [x] **TypeScript compiles with zero errors**

## 🎯 Next: Database
- [ ] `src/db/pool.ts` — PostgreSQL connection pool
- [ ] `src/db/schema.sql` — commitments + logs tables
- [ ] `src/db/queries.ts` — CRUD operations

## 🎯 Then: Scheduler
- [ ] `src/scheduler/nudge.ts` — timer-based reminders
- [ ] Warning cards at 30 min before due
- [ ] Overdue cards after due time

## 🎯 Then: Polish + Submit
- [ ] Slash commands (/what)
- [ ] Demo video
- [ ] Devpost submission

## What You Learned Today
1. Interface = blueprint for data shape. Zod = runtime validator. Know when to use each.
2. Blocks = Lego pieces for Slack cards (header → section → actions → context)
3. Destructuring = unpack data from objects so you don't write `params.` everywhere
4. Types must match across files. The `confidence` type in detection.ts must match what handler.ts sends.
5. `"text" in message` — the `in` operator narrows TypeScript union types
6. Pino logger: object FIRST, string SECOND
7. Always run `npx tsc --noEmit` before declaring done
8. **Compile after every file. Don't move on until it compiles.**
