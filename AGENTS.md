# 🤖 Diretrizes para Agentes Autônomos de IA (AGENTS.md)

Este repositório contém o **Kanban Tray**, um aplicativo desktop Tauri v2 com quadro Kanban integrado à bandeja do sistema (System Tray).

---

## 🚨 REGRA CRÍTICA DE GESTÃO DE TAREFAS

**NUNCA EDITE O ARQUIVO `tasks.json` DIRETAMENTE!**

A manipulação direta de `tasks.json` por editores de texto ou ferramentas de escrita é expressamente proibida para evitar corrupção de sintaxe, omissão acidental de tarefas e perda de dados.

Sempre utilize a **CLI determinística** através de comandos de terminal:

### Comandos da CLI:
- **Listar tarefas:** `npm run task -- list`
- **Iniciar tarefa (Em Andamento):** `npm run task -- start <id>`
- **Concluir tarefa (Concluído):** `npm run task -- done <id>`
- **Voltar tarefa (A Fazer):** `npm run task -- todo <id>`
- **Mover para coluna específica:** `npm run task -- move <id> <todo|in_progress|done>`
- **Criar tarefa:** `npm run task -- add "<Título>" ["<Descrição>"] [low|medium|high]`
- **Excluir tarefa:** `npm run task -- delete <id>`

---

## 🔄 Fluxo de Execução Recomendado

1. Ao receber uma solicitação, rode `npm run task -- list` para verificar pendências.
2. Mova a tarefa selecionada para em andamento com `npm run task -- start <id>`.
3. Desenvolva as soluções de código e testes necessários.
4. Conclua a tarefa com `npm run task -- done <id>`.

Para mais detalhes e arquitetura do protocolo, consulte [.ai-rules/tarefas_para_hoje.md](.ai-rules/tarefas_para_hoje.md).
