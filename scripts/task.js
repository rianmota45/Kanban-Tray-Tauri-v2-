#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function getStoragePaths() {
  if (process.env.KANBAN_TASKS_PATH) {
    return {
      primary: path.resolve(process.env.KANBAN_TASKS_PATH),
      primaryBak: path.resolve(process.env.KANBAN_TASKS_PATH + ".bak"),
      secondary: null,
      secondaryBak: null
    };
  }

  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : null);
  const installedDir = localAppData ? path.join(localAppData, "kanban-tray") : null;
  const installedTasks = installedDir ? path.join(installedDir, "tasks.json") : null;
  const repoTasks = path.join(rootDir, "tasks.json");

  // Se o aplicativo instalado existir no AppData e o tasks.json dele existir com dados, usa ele como primário
  if (installedTasks && fs.existsSync(installedTasks)) {
    return {
      primary: installedTasks,
      primaryBak: path.join(installedDir, "tasks.json.bak"),
      secondary: repoTasks,
      secondaryBak: path.join(rootDir, "tasks.json.bak")
    };
  }

  return {
    primary: repoTasks,
    primaryBak: path.join(rootDir, "tasks.json.bak"),
    secondary: installedTasks,
    secondaryBak: installedDir ? path.join(installedDir, "tasks.json.bak") : null
  };
}

function parseTasksContent(raw) {
  if (!raw || !raw.trim()) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed.tasks || []);
}

function tryReadFile(filePath, bakPath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseTasksContent(raw);
  } catch (err) {
    console.warn(`[WARN] Erro ao ler ${filePath}: ${err.message}. Tentando backup...`);
    if (bakPath && fs.existsSync(bakPath)) {
      try {
        const bakRaw = fs.readFileSync(bakPath, "utf-8");
        const tasks = parseTasksContent(bakRaw);
        fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), "utf-8");
        return tasks;
      } catch {}
    }
    return null;
  }
}

function loadTasks() {
  const paths = getStoragePaths();
  let tasks = tryReadFile(paths.primary, paths.primaryBak);

  // Se o primário não tiver tarefas ou for nulo, mas o secundário existir, tenta ler do secundário
  if ((!tasks || tasks.length === 0) && paths.secondary && fs.existsSync(paths.secondary)) {
    const secTasks = tryReadFile(paths.secondary, paths.secondaryBak);
    if (secTasks && secTasks.length > 0) {
      tasks = secTasks;
      // Auto-sincroniza o primário com os dados encontrados
      saveTasks(tasks);
    }
  }

  return tasks || [];
}

function writeSafe(filePath, bakPath, content) {
  if (!filePath) return;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(filePath) && bakPath) {
      const current = fs.readFileSync(filePath, "utf-8");
      if (current && current.trim()) {
        fs.writeFileSync(bakPath, current, "utf-8");
      }
    }
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    console.error(`[ERRO] Falha ao gravar em ${filePath}: ${err.message}`);
  }
}

function saveTasks(tasks) {
  const paths = getStoragePaths();
  const json = JSON.stringify(tasks, null, 2);
  writeSafe(paths.primary, paths.primaryBak, json);
  if (paths.secondary) {
    writeSafe(paths.secondary, paths.secondaryBak, json);
  }
}

const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : "help";

switch (command) {
  case "list": {
    const tasks = loadTasks();
    console.log(JSON.stringify(tasks, null, 2));
    break;
  }

  case "start":
  case "in_progress": {
    const id = args[1];
    if (!id) {
      console.error("Uso: npm run task -- start <id>");
      process.exit(1);
    }
    moveStatus(id, "in_progress");
    break;
  }

  case "done": {
    const id = args[1];
    if (!id) {
      console.error("Uso: npm run task -- done <id>");
      process.exit(1);
    }
    moveStatus(id, "done");
    break;
  }

  case "todo": {
    const id = args[1];
    if (!id) {
      console.error("Uso: npm run task -- todo <id>");
      process.exit(1);
    }
    moveStatus(id, "todo");
    break;
  }

  case "move": {
    const id = args[1];
    const status = args[2];
    if (!id || !["todo", "in_progress", "done"].includes(status)) {
      console.error("Uso: npm run task -- move <id> <todo|in_progress|done>");
      process.exit(1);
    }
    moveStatus(id, status);
    break;
  }

  case "add": {
    const title = args[1];
    if (!title) {
      console.error("Uso: npm run task -- add \"Título\" [\"Descrição\"] [low|medium|high]");
      process.exit(1);
    }
    let desc = args[2] || "";
    let priority = "medium";

    // Suporte flexível caso o agente passe: add "Título" high (sem descrição)
    if (["low", "medium", "high"].includes(args[2]?.toLowerCase()) && !args[3]) {
      priority = args[2].toLowerCase();
      desc = "";
    } else if (["low", "medium", "high"].includes(args[3]?.toLowerCase())) {
      priority = args[3].toLowerCase();
    }

    const tasks = loadTasks();
    const newTask = {
      id: `task-${Date.now().toString(36)}`,
      title,
      description: desc,
      status: "todo",
      priority,
      updated_at: new Date().toISOString(),
    };
    tasks.unshift(newTask);
    saveTasks(tasks);
    console.log(`[OK] Tarefa criada com ID: ${newTask.id}`);
    break;
  }

  case "delete": {
    const id = args[1];
    if (!id) {
      console.error("Uso: npm run task -- delete <id>");
      process.exit(1);
    }
    const tasks = loadTasks();
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length) {
      console.error(`[ERRO] Tarefa com ID "${id}" não encontrada.`);
      process.exit(1);
    }
    saveTasks(filtered);
    console.log(`[OK] Tarefa ${id} excluída com sucesso.`);
    break;
  }

  default: {
    console.log(`
Gerenciador de Tarefas CLI (Deterministic Helper para IA e Desenvolvedor)

Comandos disponíveis:
  npm run task -- list                     # Lista todas as tarefas em JSON
  npm run task -- start <id>               # Move tarefa para 'in_progress'
  npm run task -- done <id>                # Conclui tarefa ('done')
  npm run task -- todo <id>                # Move tarefa de volta para 'todo'
  npm run task -- move <id> <status>       # Move para status específico
  npm run task -- add "Título" "Desc" high # Cria nova tarefa
  npm run task -- delete <id>              # Exclui tarefa por ID
    `);
    break;
  }
}

function moveStatus(id, newStatus) {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) {
    console.error(`[ERRO] Tarefa com ID "${id}" não encontrada.`);
    process.exit(1);
  }
  task.status = newStatus;
  task.updated_at = new Date().toISOString();
  saveTasks(tasks);
  console.log(`[OK] Tarefa "${task.title}" (${id}) movida para: ${newStatus}`);
}
