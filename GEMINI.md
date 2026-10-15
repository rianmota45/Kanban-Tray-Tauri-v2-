# Gemini & Antigravity Guidelines - Kanban Tray

## 🚨 Regra Obrigatória para Gestão de Tarefas

**NUNCA EDITE `tasks.json` MANUALMENTE OU DIRETAMENTE!**

Use exclusivamente os comandos CLI determinísticos:
- Listar tarefas: `npm run task -- list`
- Iniciar tarefa: `npm run task -- start <id>`
- Concluir tarefa: `npm run task -- done <id>`
- Mover tarefa: `npm run task -- move <id> <status>`
- Criar tarefa: `npm run task -- add "<Título>" ["<Descrição>"] [low|medium|high]`
- Excluir tarefa: `npm run task -- delete <id>`

Instruções detalhadas em [.ai-rules/tarefas_para_hoje.md](.ai-rules/tarefas_para_hoje.md).
