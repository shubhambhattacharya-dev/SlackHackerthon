# 001: DRY Action Handler Pattern

**Date:** July 10, 2026

## Context

The Slack bot has multiple buttons (Confirm, Dismiss, Complete, Emergency). Each button fires a different `action_id` but does the same thing: update commitment status in DB + update the Slack message.

## Decision

Use a single `app.action()` handler with regex matching (`/^commitment_/`) and a status map instead of separate handlers for each button.

```ts
const actions = {
    commitment_confirm: { status: "confirmed", emoji: "✅" },
    commitment_dismiss: { status: "cancelled", emoji: "❌" },
} as const;
```

**Pattern:** Strategy Pattern — map action_id → { status, emoji }, one handler reads the map.

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Separate handler per button | Clear, explicit | Repetitive, violates DRY |
| One handler with if/else chain | Less code | Still repetitive, harder to add new actions |
| Map-based handler (chosen) | Add new action in one line. Scale to 10+ buttons | Requires type-safe map access |

## Consequences

- ✅ Adding new button: one line in the `actions` map
- ✅ Removing button: delete one line
- ✅ TypeScript catches invalid action_ids at compile time
- ❌ All buttons share same error handling — can't customize per action without refactor
