# GitHub Copilot Instructions - Kanban Tray

## Task Management
- **Never edit `tasks.json` directly.**
- Always use the deterministic CLI:
  - `npm run task -- list`
  - `npm run task -- start <id>`
  - `npm run task -- done <id>`
  - `npm run task -- move <id> <status>`
  - `npm run task -- add "<Title>" ["<Description>"] [low|medium|high]`
  - `npm run task -- delete <id>`

See `.ai-rules/tarefas_para_hoje.md` for full instructions.
