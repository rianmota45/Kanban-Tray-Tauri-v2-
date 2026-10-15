# Claude Code Guidelines - Kanban Tray

## Task Management Protocol

**DO NOT edit `tasks.json` directly!**
Direct edits to `tasks.json` using file tools or regex can cause JSON syntax corruption or task loss.

Always use the deterministic task CLI:
- **List tasks:** `npm run task -- list`
- **Start task:** `npm run task -- start <id>`
- **Complete task:** `npm run task -- done <id>`
- **Move task:** `npm run task -- move <id> <todo|in_progress|done>`
- **Create task:** `npm run task -- add "<Title>" ["<Description>"] [low|medium|high]`
- **Delete task:** `npm run task -- delete <id>`

For full instructions, see [.ai-rules/tarefas_para_hoje.md](.ai-rules/tarefas_para_hoje.md).
