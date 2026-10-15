---
name: kanban-tasks
description: >-
  Gerencia tarefas e fluxo de trabalho no Kanban Tray integrado à bandeja do Windows.
  Use quando o usuário solicitar para listar, adicionar, iniciar, mover, concluir ou
  organizar tarefas no quadro Kanban, ou para registrar o ciclo de trabalho de uma demanda.

  Se essa skill foi invocada, é por que você deve trabalhar em alguma tarefa. 
  Se o usuário não mencionar nenhuma tarefa específica, escolha a tarefa mais urgente 
  ou uma das tarefas mais urgentes e comece a trabalhar nelas. 
  Não pergunte nada (pois se essa skill foi invocada, a intenção já era essa), 
  apenas pegue a tarefa e começe a executa-la.
---

# Kanban Tray - Gerenciamento de Tarefas

Esta skill guia o agente no ciclo de vida determinístico de tarefas no aplicativo desktop **Kanban Tray** (Tauri v2).

# O que fazer
Se essa skill for invocada, o agente deve: Pegar a tarefa mais urgente do quadro Kanban, iniciar o trabalho, concluir a tarefa e registrar o ciclo de vida da demanda.
Quando pegar a tarefa, antes de começar a trabalhar nela, o agente deve mover a tarefa para o status "Em Andamento" e, ao concluir, mover a tarefa para o status "Concluído".

Se essa skill foi invocada, é por que você já tem permissão para iniciar a tarefa, então escolha a tarefa mais urgente ou uma das tarefas mais urgentes e comece a trabalhar nelas. Não pergunte nada, apenas pegue a tarefa e começe a executa-la.

Se nenhuma tarefa específica foi mencionada, pegue a tarefa da coluna 'a fazer', pois talvez a tarefa da coluna 'em andamento' já esteja sendo executada por outro agente. Se não houver tarefas na coluna 'a fazer', pergunte ao usuário se ele deseja criar uma nova tarefa ou se deseja pegar uma tarefa da coluna 'em andamento'.

Se a tarefa for algo onde o sucesso dela depende do gosto do usuário como por exemplo, a criação de uma interface de usuário, então você deve apenas fazer a tarefa e antes de mover para o status "Concluido", vocÊ deve deixar que o usuário julgue, talvez ele sugira edições ou melhorias.

   [!CAUTION]
   Ao terminar essa tarefa, não mencione o inicio de outra tarefa, você deve focar apenas na que você executou, você só irá para outra tarefa caso o usuário mencione.

> [!CAUTION]
> ### 🚨 REGRA CRÍTICA: NUNCA EDITE `tasks.json` DIRETAMENTE!
> A manipulação direta do arquivo `tasks.json` por editores ou ferramentas de escrita é estritamente proibida.
> **SEMPRE** utilize a CLI determinística via comando de terminal.

---

## 🛠️ Comandos da CLI

Quando estiver no diretório raiz do projeto:
```bash
npm run task -- <comando>
```

Ou apontando diretamente para o script:
```bash
node scripts/task.js <comando>
```

### Tabela de Comandos

| Ação | Comando | Exemplo |
| :--- | :--- | :--- |
| **Listar tarefas** | `list` | `npm run task -- list` |
| **Iniciar tarefa** *(move para Em Andamento)* | `start <id>` | `npm run task -- start task-001` |
| **Concluir tarefa** *(move para Concluído)* | `done <id>` | `npm run task -- done task-001` |
| **Retornar para a fazer** *(move para A Fazer)* | `todo <id>` | `npm run task -- todo task-001` |
| **Mover customizado** | `move <id> <status>` | `npm run task -- move task-001 in_progress` |
| **Criar nova tarefa** | `add "<Título>" ["<Descrição>"] [prioridade]` | `npm run task -- add "Configurar CI" "Criar action" high` |
| **Excluir tarefa** | `delete <id>` | `npm run task -- delete task-001` |

- **Prioridades válidas:** `high`, `medium`, `low` (padrão: `medium`).
- **Status válidos:** `todo`, `in_progress`, `done`.

---

## 🔄 Ciclo de Vida Padrão de Execução

Ao receber uma demanda ou trabalhar em funcionalidades:

1. **Verificar pendências:**
   ```bash
   npm run task -- list
   ```
2. **Iniciar o trabalho (Em Andamento):**
   ```bash
   npm run task -- start <id>
   ```
   *O cartão se move instantaneamente para a coluna "Em Andamento" no System Tray do Windows.*
3. **Desenvolver e testar:**
   Execute o código e validações necessárias.
4. **Finalizar (Concluído):**
   ```bash
   npm run task -- done <id>
   ```
5. **Cadastrar novas tarefas/débitos técnicos:**
   ```bash
   npm run task -- add "<Título>" ["<Descrição>"] [prioridade]
   ```
