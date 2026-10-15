# ⚡ Protocolo Obrigatório de Tarefas para Agentes de IA

Este documento define as regras estritas e oficiais de interação para qualquer Agente Autônomo de IA (Antigravity, Claude Code, Cursor, Copilot, Windsurf, Aider, etc.) operando neste repositório.

---

> [!CAUTION]
> ### 🚨 REGRA DE OURO: NUNCA EDITE `tasks.json` DIRETAMENTE!
> **NUNCA** use ferramentas de edição de arquivos (`replace_file_content`, `write_to_file`, regex ou scripts ad-hoc) para modificar diretamente o arquivo `tasks.json`.
>
> ❌ **Errado:** Abrir `tasks.json` e reescrever o texto JSON.  
> ✔️ **Correto:** Executar os comandos determinísticos da CLI: `npm run task -- <comando>`.

---

## 🛡️ Por que o uso da CLI é obrigatório?

1. **Determinismo Absoluto (Zero Erro de Sintaxe):** A CLI roda código Node.js puro (`scripts/task.js`). Uma LLM nunca corre o risco de esquecer uma vírgula, quebrar aspas ou apagar tarefas acidentalmente.
2. **Auto-Backup e Auto-Heal:** A cada alteração, a CLI gera um backup em `tasks.json.bak`. Se qualquer anomalia ocorrer, o sistema auto-restaura o estado válido anterior.
3. **Sincronização em Tempo Real com o System Tray:** A gravação determinística dispara o file watcher do backend em Rust, fazendo o Kanban flutuante na bandeja do Windows refletir o movimento do cartão instantaneamente para o usuário.

---

## 📋 Tabela de Comandos Rápidos

Sempre execute os comandos a partir da raiz do projeto (`kanban-tray`):

| Ação Desejada | Comando Exato | Exemplo Prático |
| :--- | :--- | :--- |
| **Listar tarefas ativas** | `npm run task -- list` | `npm run task -- list` |
| **Iniciar tarefa** *(move para Em Andamento)* | `npm run task -- start <id>` | `npm run task -- start task-001` |
| **Concluir tarefa** *(move para Concluído)* | `npm run task -- done <id>` | `npm run task -- done task-001` |
| **Retornar para a fazer** *(move para A Fazer)* | `npm run task -- todo <id>` | `npm run task -- todo task-001` |
| **Mover customizado** | `npm run task -- move <id> <status>` | `npm run task -- move task-001 in_progress` |
| **Criar nova tarefa** | `npm run task -- add "<Título>" ["<Descrição>"] [prioridade]` | `npm run task -- add "Criar endpoint de login" "Suporte a JWT" high` |
| **Excluir tarefa** | `npm run task -- delete <id>` | `npm run task -- delete task-001` |

> [!NOTE]
> - Prioridades válidas: `high`, `medium`, `low` (padrão: `medium`).
> - Status válidos: `todo`, `in_progress`, `done`.

---

## 🤖 Ciclo de Vida Padrão de Trabalho da IA

Ao iniciar qualquer interação ou rodar tarefas no projeto, a IA deve seguir este ciclo rigoroso:

### Passo 1: Listar tarefas
```bash
npm run task -- list
```
Examine o array de tarefas retornado. Localize a tarefa que você deve executar e anote o seu `"id"` (ex: `"task-003"`).

### Passo 2: Assumir a tarefa (Em Andamento)
```bash
npm run task -- start task-003
```
*Efeito:* O cartão visual no Kanban do usuário se move imediatamente para a coluna **"Em Andamento"** ⏳.

### Passo 3: Executar as modificações de código
Realize as alterações nos arquivos, crie código, execute testes ou compilações necessárias para cumprir o objetivo da tarefa.

### Passo 4: Concluir a tarefa (Concluído)
Assim que o trabalho estiver testado e finalizado com sucesso:
```bash
npm run task -- done task-003
```
*Efeito:* O cartão visual no Kanban se move para a coluna **"Concluído"** 🎉.

### Passo 5: Criar novas tarefas se necessário
Se durante o trabalho forem identificadas novas demandas, pendências ou melhorias futuras:
```bash
npm run task -- add "Implementar validação de payload" "Adicionar sanitização nos campos" medium
```
