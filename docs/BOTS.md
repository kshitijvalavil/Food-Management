# The bot team

| Bot | Agent file | Model | Owns |
|---|---|---|---|
| Manager | `.claude/agents/manager.md` | `claude-sonnet-5-5` | specs, sprint plans, assigning tasks, unblocking, board |
| Sir Pixelot | `.claude/agents/sir-pixelot.md` | `claude-opus-5-5` | phone-only PWA screens, camera/barcode, design system, a11y |
| Byte Vader | `.claude/agents/byte-vader.md` | `claude-opus-5-5` | edge functions, Claude prompts and schemas, integrations |
| Tabledore | `.claude/agents/tabledore.md` | `claude-opus-5-5` | schema, RLS, migrations, FoodKeeper seed |
| Sherlock Bugs | `.claude/agents/sherlock-bugs.md` | `claude-opus-5-5` | all testing and safety checks; approves PRs |
| Captain Shipit | `.claude/agents/captain-shipit.md` | `claude-opus-5-5` | CI, Vercel previews and production, PWA audit, merges |

## How they run without approvals
1. **One approval.** Boss approves `approvals/plan-kickoff` on the board. Nothing else waits on Boss.
2. **Sessions.** The Manager starts each bot as its own cloud session with `create_session`, using `model: claude-opus-5-5` and `permission_mode: auto`, the agent file's prompt and this repo.
3. **Talking.** Bots message each other with `send_message` using this format: `[FROM → TO] task-id: what's ready / what's needed, branch, PR link`. Each message is also logged on the board.
4. **Check-ins.** A scheduled task wakes the Manager every 2 hours. It reads the board, pings stale tasks (no update for more than 2 hours), and reassigns blocked work.
5. **Review loop.** Owner opens PR → CI runs → Sherlock tests and approves or requests changes → Captain Shipit merges and builds. A failed check sends the task back to its owner with the failure attached.
6. **Release.** At sprint end, if every check in `board/security` passes, Shipit merges to `main`. Vercel deploys production, Shipit runs the Lighthouse PWA audit on the live URL and logs the link. Boss's home-screen app updates the next time it opens.

## What stays human
Saving keys through the credential form. There are no store accounts while ShelfLife is a web app.
