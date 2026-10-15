// Kanban Tray - Frontend Controller (3-Column Layout, Rock-Solid Pointer Drag & Drop, Pin Window)
let invokeTauri = null;
let listenTauri = null;

// Inicialização segura das APIs do Tauri v2
async function initTauriApi() {
  try {
    const core = await import("@tauri-apps/api/core");
    invokeTauri = core.invoke;
  } catch {
    if (window.__TAURI__?.core?.invoke) {
      invokeTauri = window.__TAURI__.core.invoke;
    } else if (window.__TAURI__?.invoke) {
      invokeTauri = window.__TAURI__.invoke;
    }
  }

  try {
    const event = await import("@tauri-apps/api/event");
    listenTauri = event.listen;
  } catch {
    if (window.__TAURI__?.event?.listen) {
      listenTauri = window.__TAURI__.event.listen;
    }
  }
}

// Wrapper para invocar comandos Rust
async function invoke(cmd, args = {}) {
  if (!invokeTauri) {
    await initTauriApi();
  }
  if (invokeTauri) {
    return await invokeTauri(cmd, args);
  }
  console.warn(`[Mock] invoke("${cmd}", ${JSON.stringify(args)})`);
  return [];
}

// Estado da Aplicação
const state = {
  tasks: [],
  searchQuery: "",
  editingTaskId: null,
  viewingTaskId: null,
  taskToDeleteId: null,
  isPinned: false,
  currentTheme: localStorage.getItem("kanban-theme") || "minimal",
  newTaskTargetStatus: "todo",
  currentShortcut: "CommandOrControl+Space",
  pendingShortcut: "CommandOrControl+Space",
  isRecordingShortcut: false,
};

// Elementos do DOM
const dom = {
  columns: document.querySelectorAll(".kanban-column"),
  counts: {
    todo: document.getElementById("count-todo"),
    in_progress: document.getElementById("count-in_progress"),
    done: document.getElementById("count-done"),
  },
  cardsLists: {
    todo: document.getElementById("cards-todo"),
    in_progress: document.getElementById("cards-in_progress"),
    done: document.getElementById("cards-done"),
  },
  btnThemeToggle: document.getElementById("btn-theme-toggle"),
  btnShortcutConfig: document.getElementById("btn-shortcut-config"),
  colAddButtons: document.querySelectorAll(".btn-col-add"),
  btnNewTask: document.getElementById("btn-new-task"),
  btnOpenJson: document.getElementById("btn-open-json"),
  btnPinWindow: document.getElementById("btn-pin-window"),
  btnRefresh: document.getElementById("btn-refresh"),
  searchInput: document.getElementById("search-input"),
  searchClear: document.getElementById("search-clear"),
  modal: document.getElementById("task-modal"),
  modalTitle: document.getElementById("modal-title"),
  taskForm: document.getElementById("task-form"),
  taskIdInput: document.getElementById("task-id"),
  taskTitleInput: document.getElementById("task-title-input"),
  taskDescInput: document.getElementById("task-desc-input"),
  modalClose: document.getElementById("modal-close"),
  btnModalCancel: document.getElementById("btn-modal-cancel"),
  deleteModal: document.getElementById("delete-modal"),
  deleteModalText: document.getElementById("delete-modal-text"),
  btnDeleteCancel: document.getElementById("btn-delete-cancel"),
  btnDeleteConfirm: document.getElementById("btn-delete-confirm"),
  viewModal: document.getElementById("view-task-modal"),
  viewModalClose: document.getElementById("view-modal-close"),
  viewTaskStatus: document.getElementById("view-task-status"),
  viewTaskPriority: document.getElementById("view-task-priority"),
  viewTaskDate: document.getElementById("view-task-date"),
  viewTaskTitle: document.getElementById("view-task-title"),
  viewTaskTimestamp: document.getElementById("view-task-timestamp"),
  viewTaskDesc: document.getElementById("view-task-desc"),
  viewQuickMove: document.getElementById("view-quick-move"),
  btnViewClose: document.getElementById("btn-view-close"),
  btnViewEdit: document.getElementById("btn-view-edit"),
  shortcutModal: document.getElementById("shortcut-modal"),
  shortcutModalClose: document.getElementById("shortcut-modal-close"),
  shortcutRecorder: document.getElementById("shortcut-recorder"),
  recorderKeysDisplay: document.getElementById("recorder-keys-display"),
  recorderHint: document.getElementById("recorder-hint"),
  shortcutError: document.getElementById("shortcut-error"),
  shortcutPresetsList: document.getElementById("shortcut-presets-list"),
  btnShortcutCancel: document.getElementById("btn-shortcut-cancel"),
  btnShortcutSave: document.getElementById("btn-shortcut-save"),
  toast: document.getElementById("toast-message"),
};

// Formatação amigável de tempo relativo
function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (isNaN(diffSec) || diffSec < 0) return "recente";
  if (diffSec < 45) return "agora";
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Toast Notificações
let toastTimer = null;
function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, 2000);
}

// Carregar Tarefas do Backend Rust
async function loadTasks(silent = false) {
  try {
    const tasks = await invoke("get_tasks");
    state.tasks = Array.isArray(tasks) ? tasks : [];
    renderBoard();
    if (!silent) {
      showToast("Quadro atualizado");
    }
  } catch (err) {
    console.error("Erro ao carregar tarefas:", err);
  }
}

// Filtrar Tarefas pela Busca
function getFilteredTasks() {
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) return state.tasks;
  return state.tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
  );
}

// Renderização do Quadro (3 Colunas Sempre Visíveis)
function renderBoard() {
  const filtered = getFilteredTasks();

  const columnsData = {
    todo: filtered.filter((t) => t.status === "todo"),
    in_progress: filtered.filter((t) => t.status === "in_progress"),
    done: filtered.filter((t) => t.status === "done"),
  };

  // Atualizar contadores e cartões de cada coluna
  for (const status of ["todo", "in_progress", "done"]) {
    const count = columnsData[status].length;
    if (dom.counts[status]) dom.counts[status].textContent = count;

    const container = dom.cardsLists[status];
    if (!container) continue;
    container.innerHTML = "";

    if (columnsData[status].length === 0) {
      container.appendChild(createEmptyState(status));
    } else {
      columnsData[status].forEach((task) => {
        container.appendChild(createCardElement(task));
      });
    }
  }
}

// Elemento de Estado Vazio
function createEmptyState(status) {
  const div = document.createElement("div");
  div.className = "empty-state";
  const icon = status === "done" ? "🎉" : status === "in_progress" ? "⏳" : "📝";
  const msg =
    status === "done"
      ? "Nenhuma concluída"
      : status === "in_progress"
      ? "Nenhuma em andamento"
      : "Nenhuma a fazer";

  div.innerHTML = `
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${msg}</div>
    <div class="empty-sub">Arraste para cá</div>
  `;
  return div;
}

// Criação do Elemento Card com Pointer Drag & Drop e Botões de Ação
function createCardElement(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.dataset.id = task.id;

  const priorityLabels = {
    high: "🔴 Alta",
    medium: "🟡 Média",
    low: "🟢 Baixa",
  };

  // Botões de transição rápida de status
  let moveButtonsHtml = "";
  if (task.status === "todo") {
    moveButtonsHtml = `
      <button class="btn-move btn-progress" data-action="move" data-to="in_progress" title="Mover para Em Andamento">
        Iniciar ▶
      </button>
    `;
  } else if (task.status === "in_progress") {
    moveButtonsHtml = `
      <button class="btn-move" data-action="move" data-to="todo" title="Voltar para A Fazer">
        ◀ A Fazer
      </button>
      <button class="btn-move btn-done" data-action="move" data-to="done" title="Concluir tarefa">
        Concluir ✔
      </button>
    `;
  } else if (task.status === "done") {
    moveButtonsHtml = `
      <button class="btn-move" data-action="move" data-to="in_progress" title="Reabrir em andamento">
        ↺ Reabrir
      </button>
    `;
  }

  card.innerHTML = `
    <div class="card-top">
      <div style="display: flex; align-items: center;">
        <span class="drag-grip" title="Arraste para mover">⠿</span>
        <span class="priority-tag ${task.priority}">${priorityLabels[task.priority] || task.priority}</span>
      </div>
      <span class="card-date">${formatRelativeTime(task.updated_at)}</span>
    </div>
    <div class="card-title">${escapeHtml(task.title)}</div>
    ${task.description ? `<div class="card-desc">${escapeHtml(task.description)}</div>` : ""}
    <div class="card-footer">
      <div class="quick-move-group">
        ${moveButtonsHtml}
      </div>
      <div class="card-more-actions">
        <button class="btn-action-sm btn-edit" data-action="edit" title="Editar">✎</button>
        <button class="btn-action-sm btn-delete" data-action="delete" title="Excluir">🗑</button>
      </div>
    </div>
  `;

  // Configuração do Pointer Drag & Drop (100% confiável em WebViews desktop)
  setupCardPointerDrag(card, task);

  // Ações nos botões internos do Card (cliques diretos)
  card.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "move") {
      const nextStatus = btn.dataset.to;
      await moveTaskStatus(task.id, nextStatus);
    } else if (action === "edit") {
      openEditModal(task);
    } else if (action === "delete") {
      openDeleteModal(task);
    }
  });

  // Visualização completa da tarefa com duplo clique
  card.addEventListener("dblclick", (e) => {
    if (e.target.closest("button") || e.target.closest(".drag-grip")) return;
    openViewModal(task);
  });

  return card;
}

// Sistema de Arraste e Solte Baseado em Pointer Events
function setupCardPointerDrag(card, task) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let ghost = null;
  let currentTargetColumn = null;

  const onPointerDown = (e) => {
    // Apenas botão esquerdo do mouse
    if (e.button !== 0) return;
    // Não arrastar se o clique foi em um botão (como editar, excluir, avançar)
    if (e.target.closest("button")) return;

    startX = e.clientX;
    startY = e.clientY;
    const rect = card.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    isDragging = false;
    currentTargetColumn = null;

    const onPointerMove = (moveEvt) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      // Iniciar o arrasto após movimentação de 4 pixels
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDragging = true;
        card.classList.add("dragging-source");

        // Criar elemento fantasma que segue o cursor
        ghost = card.cloneNode(true);
        ghost.classList.add("drag-ghost");
        ghost.style.width = `${rect.width}px`;
        ghost.style.left = `${moveEvt.clientX - offsetX}px`;
        ghost.style.top = `${moveEvt.clientY - offsetY}px`;
        document.body.appendChild(ghost);
      }

      if (isDragging && ghost) {
        ghost.style.left = `${moveEvt.clientX - offsetX}px`;
        ghost.style.top = `${moveEvt.clientY - offsetY}px`;

        // Identifica coluna sob o cursor
        const elementsUnder = document.elementsFromPoint(moveEvt.clientX, moveEvt.clientY);
        const col = elementsUnder.find(
          (el) => el && el.classList && el.classList.contains("kanban-column")
        );

        if (col !== currentTargetColumn) {
          if (currentTargetColumn) currentTargetColumn.classList.remove("drag-over");
          currentTargetColumn = col || null;
          if (currentTargetColumn) currentTargetColumn.classList.add("drag-over");
        }
      }
    };

    const onPointerUp = async (upEvt) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (isDragging) {
        if (ghost && ghost.parentNode) {
          ghost.parentNode.removeChild(ghost);
          ghost = null;
        }

        card.classList.remove("dragging-source");

        if (currentTargetColumn) {
          currentTargetColumn.classList.remove("drag-over");
          const nextStatus = currentTargetColumn.dataset.status;
          if (nextStatus && nextStatus !== task.status) {
            await moveTaskStatus(task.id, nextStatus);
          }
          currentTargetColumn = null;
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  card.addEventListener("pointerdown", onPointerDown);
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Alterar Status da Tarefa
async function moveTaskStatus(id, newStatus) {
  try {
    await invoke("update_task_status", { id, status: newStatus });
    await loadTasks(true);
    showToast(`Status atualizado`);
  } catch (err) {
    console.error("Erro ao alterar status:", err);
    showToast("Erro ao mover tarefa");
  }
}

// Excluir Tarefa
async function deleteTask(id) {
  try {
    await invoke("delete_task", { id });
    await loadTasks(true);
    showToast("Tarefa excluída");
  } catch (err) {
    console.error("Erro ao excluir tarefa:", err);
  }
}

// Alternar Fixação da Janela (Pin Toggle)
async function togglePin() {
  state.isPinned = !state.isPinned;
  try {
    await invoke("set_pinned", { pinned: state.isPinned });
    dom.btnPinWindow.classList.toggle("pinned", state.isPinned);

    if (state.isPinned) {
      dom.btnPinWindow.title = "Desafixar janela (fechar ao clicar fora)";
      showToast("Janela fixada 📌");
    } else {
      dom.btnPinWindow.title = "Fixar janela (não fechar ao clicar fora)";
      showToast("Janela desafixada");
    }
  } catch (err) {
    console.error("Erro ao alternar fixação:", err);
  }
}

// Modal de Leitura / Visualização Completa (Duplo Clique)
function openViewModal(task) {
  state.viewingTaskId = task.id;
  if (!dom.viewModal) return;

  dom.viewTaskTitle.textContent = task.title;
  dom.viewTaskDesc.textContent = task.description || "";

  const statusLabels = {
    todo: "A Fazer",
    in_progress: "Em Andamento",
    done: "Concluído",
  };
  dom.viewTaskStatus.textContent = statusLabels[task.status] || task.status;
  dom.viewTaskStatus.className = `status-badge status-${task.status}`;

  const priorityLabels = {
    high: "🔴 Alta",
    medium: "🟡 Média",
    low: "🟢 Baixa",
  };
  dom.viewTaskPriority.textContent = priorityLabels[task.priority] || task.priority;
  dom.viewTaskPriority.className = `priority-tag ${task.priority}`;

  dom.viewTaskDate.textContent = `Atualizado ${formatRelativeTime(task.updated_at)}`;
  dom.viewTaskTimestamp.textContent = task.created_at
    ? `Criada em ${new Date(task.created_at).toLocaleString("pt-BR")}`
    : "";

  // Botões de movimentação rápida dentro do modal de leitura
  let moveButtonsHtml = "";
  if (task.status === "todo") {
    moveButtonsHtml = `
      <button class="btn-move btn-progress" data-action="view-move" data-to="in_progress">
        Iniciar Tarefa ▶
      </button>
    `;
  } else if (task.status === "in_progress") {
    moveButtonsHtml = `
      <button class="btn-move" data-action="view-move" data-to="todo">
        ◀ A Fazer
      </button>
      <button class="btn-move btn-done" data-action="view-move" data-to="done">
        Concluir ✔
      </button>
    `;
  } else if (task.status === "done") {
    moveButtonsHtml = `
      <button class="btn-move" data-action="view-move" data-to="in_progress">
        ↺ Reabrir Tarefa
      </button>
    `;
  }
  dom.viewQuickMove.innerHTML = moveButtonsHtml;

  dom.viewModal.style.display = "flex";
}

function closeViewModal() {
  if (dom.viewModal) dom.viewModal.style.display = "none";
  state.viewingTaskId = null;
}

// Gestão de Temas (Minimalista Obsidian vs Dark Glass)
function applyTheme(themeName, notify = false) {
  state.currentTheme = themeName;
  document.body.dataset.theme = themeName;
  localStorage.setItem("kanban-theme", themeName);

  if (dom.btnThemeToggle) {
    dom.btnThemeToggle.title =
      themeName === "minimal"
        ? "Tema atual: Minimalista Obsidian (Clique para alternar para Dark Glass)"
        : "Tema atual: Dark Glass (Clique para alternar para Minimalista)";
  }

  if (notify) {
    const label = themeName === "minimal" ? "Minimalista Obsidian ✨" : "Dark Glass 💎";
    showToast(`Tema: ${label}`);
  }
}

function toggleTheme() {
  const nextTheme = state.currentTheme === "minimal" ? "glass" : "minimal";
  
  if (dom.btnThemeToggle) {
    dom.btnThemeToggle.style.transform = "scale(0.85) rotate(-20deg)";
    setTimeout(() => {
      if (dom.btnThemeToggle) dom.btnThemeToggle.style.transform = "";
    }, 220);
  }

  applyTheme(nextTheme, true);
}

// Modal de Criação / Edição
function openNewTaskModal(targetStatus = "todo") {
  state.editingTaskId = null;
  state.newTaskTargetStatus = typeof targetStatus === "string" ? targetStatus : "todo";
  dom.modalTitle.textContent = "Nova Tarefa";
  dom.taskIdInput.value = "";
  dom.taskTitleInput.value = "";
  dom.taskDescInput.value = "";
  const mediumRadio = dom.taskForm.querySelector('input[name="priority"][value="medium"]');
  if (mediumRadio) mediumRadio.checked = true;

  dom.modal.style.display = "flex";
  setTimeout(() => dom.taskTitleInput.focus(), 50);
}

function openEditModal(task) {
  state.editingTaskId = task.id;
  dom.modalTitle.textContent = "Editar Tarefa";
  dom.taskIdInput.value = task.id;
  dom.taskTitleInput.value = task.title;
  dom.taskDescInput.value = task.description || "";
  const radio = dom.taskForm.querySelector(`input[name="priority"][value="${task.priority}"]`);
  if (radio) radio.checked = true;

  dom.modal.style.display = "flex";
  setTimeout(() => dom.taskTitleInput.focus(), 50);
}

function closeModal() {
  dom.modal.style.display = "none";
  state.editingTaskId = null;
}

function openDeleteModal(task) {
  state.taskToDeleteId = task.id;
  dom.deleteModalText.textContent = `Deseja realmente excluir a tarefa "${task.title}"? Esta ação não pode ser desfeita.`;
  dom.deleteModal.style.display = "flex";
}

function closeDeleteModal() {
  dom.deleteModal.style.display = "none";
  state.taskToDeleteId = null;
}

// Envio do Formulário Modal
dom.taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = dom.taskTitleInput.value.trim();
  if (!title) return;

  const description = dom.taskDescInput.value.trim();
  const priorityRadio = dom.taskForm.querySelector('input[name="priority"]:checked');
  const priority = priorityRadio ? priorityRadio.value : "medium";

  try {
    if (state.editingTaskId) {
      const existing = state.tasks.find((t) => t.id === state.editingTaskId);
      if (existing) {
        await invoke("update_task", {
          task: {
            ...existing,
            title,
            description,
            priority,
          },
        });
        showToast("Tarefa atualizada");
      }
    } else {
      const created = await invoke("create_task", {
        title,
        description,
        priority,
      });
      if (state.newTaskTargetStatus && state.newTaskTargetStatus !== "todo" && created?.id) {
        await invoke("update_task_status", {
          id: created.id,
          status: state.newTaskTargetStatus,
        });
      }
      showToast("Nova tarefa criada");
    }

    closeModal();
    await loadTasks(true);
  } catch (err) {
    console.error("Erro ao salvar tarefa:", err);
    showToast("Erro ao salvar tarefa");
  }
});

// Event Listeners Globais
if (dom.btnThemeToggle) {
  dom.btnThemeToggle.addEventListener("click", toggleTheme);
}

dom.colAddButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    openNewTaskModal(btn.dataset.status || "todo");
  });
});

dom.btnNewTask.addEventListener("click", () => openNewTaskModal("todo"));
dom.modalClose.addEventListener("click", closeModal);
dom.btnModalCancel.addEventListener("click", closeModal);
dom.btnPinWindow.addEventListener("click", togglePin);

dom.modal.addEventListener("click", (e) => {
  if (e.target === dom.modal) closeModal();
});

// Eventos do Modal de Visualização (Duplo Clique)
if (dom.viewModalClose) dom.viewModalClose.addEventListener("click", closeViewModal);
if (dom.btnViewClose) dom.btnViewClose.addEventListener("click", closeViewModal);
if (dom.btnViewEdit) {
  dom.btnViewEdit.addEventListener("click", () => {
    const task = state.tasks.find((t) => t.id === state.viewingTaskId);
    closeViewModal();
    if (task) openEditModal(task);
  });
}
if (dom.viewModal) {
  dom.viewModal.addEventListener("click", (e) => {
    if (e.target === dom.viewModal) closeViewModal();
  });
}
if (dom.viewQuickMove) {
  dom.viewQuickMove.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const nextStatus = btn.dataset.to;
    if (nextStatus && state.viewingTaskId) {
      const taskId = state.viewingTaskId;
      await moveTaskStatus(taskId, nextStatus);
      const updated = state.tasks.find((t) => t.id === taskId);
      if (updated) {
        openViewModal(updated);
      } else {
        closeViewModal();
      }
    }
  });
}

dom.btnDeleteCancel.addEventListener("click", closeDeleteModal);
dom.btnDeleteConfirm.addEventListener("click", async () => {
  if (state.taskToDeleteId) {
    const id = state.taskToDeleteId;
    closeDeleteModal();
    await deleteTask(id);
  }
});

dom.deleteModal.addEventListener("click", (e) => {
  if (e.target === dom.deleteModal) closeDeleteModal();
});

dom.btnOpenJson.addEventListener("click", async () => {
  try {
    await invoke("open_tasks_file");
    showToast("Abrindo tasks.json...");
  } catch (err) {
    console.error(err);
  }
});

dom.btnRefresh.addEventListener("click", () => loadTasks(false));

// Busca e Filtro
dom.searchInput.addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  dom.searchClear.style.display = state.searchQuery ? "inline-block" : "none";
  renderBoard();
});

dom.searchClear.addEventListener("click", () => {
  dom.searchInput.value = "";
  state.searchQuery = "";
  dom.searchClear.style.display = "none";
  renderBoard();
});

// ========================================================
// Gerenciamento de Atalho Global Personalizável
// ========================================================

function formatShortcutForDisplay(sc) {
  if (!sc || typeof sc !== "string") return "Ctrl + Espaço";
  const parts = sc.split("+").map((p) => p.trim());
  return parts
    .map((part) => {
      if (part === "CommandOrControl" || part === "Control" || part === "Ctrl") {
        return "Ctrl";
      }
      if (part === "Space") {
        return "Espaço";
      }
      return part;
    })
    .join(" + ");
}

function renderShortcutBadges(sc, containerEl) {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  if (!sc) {
    const kbd = document.createElement("kbd");
    kbd.className = "key-badge";
    kbd.textContent = "Nenhum";
    containerEl.appendChild(kbd);
    return;
  }
  const parts = sc.split("+").map((p) => p.trim());
  parts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "key-sep";
      sep.textContent = "+";
      containerEl.appendChild(sep);
    }
    const kbd = document.createElement("kbd");
    kbd.className = "key-badge";
    let label = part;
    if (part === "CommandOrControl" || part === "Control" || part === "Ctrl") {
      label = "Ctrl";
    } else if (part === "Space") {
      label = "Espaço";
    }
    kbd.textContent = label;
    containerEl.appendChild(kbd);
  });
}

function updateActivePreset(sc) {
  if (!dom.shortcutPresetsList) return;
  const normalized = (sc || "").toLowerCase().replace(/\s+/g, "");
  dom.shortcutPresetsList.querySelectorAll(".preset-pill").forEach((btn) => {
    const btnSc = (btn.dataset.shortcut || "").toLowerCase().replace(/\s+/g, "");
    btn.classList.toggle("active", btnSc === normalized);
  });
}

function setPendingShortcut(sc) {
  state.pendingShortcut = sc;
  renderShortcutBadges(sc, dom.recorderKeysDisplay);
  updateActivePreset(sc);
  if (dom.shortcutError) {
    dom.shortcutError.style.display = "none";
    dom.shortcutError.textContent = "";
  }
}

function openShortcutModal() {
  state.pendingShortcut = state.currentShortcut || "CommandOrControl+Space";
  state.isRecordingShortcut = false;
  if (dom.shortcutRecorder) {
    dom.shortcutRecorder.classList.remove("recording");
  }
  if (dom.recorderHint) {
    dom.recorderHint.textContent = "Clique para gravar";
  }
  setPendingShortcut(state.pendingShortcut);
  if (dom.shortcutModal) {
    dom.shortcutModal.style.display = "flex";
  }
}

function closeShortcutModal() {
  state.isRecordingShortcut = false;
  if (dom.shortcutRecorder) {
    dom.shortcutRecorder.classList.remove("recording");
  }
  if (dom.shortcutModal) {
    dom.shortcutModal.style.display = "none";
  }
}

async function saveShortcut() {
  if (!state.pendingShortcut) return;
  try {
    const saved = await invoke("set_global_shortcut", { shortcut: state.pendingShortcut });
    state.currentShortcut = saved || state.pendingShortcut;
    if (dom.btnShortcutConfig) {
      dom.btnShortcutConfig.textContent = formatShortcutForDisplay(state.currentShortcut);
    }
    closeShortcutModal();
    showToast(`Atalho atualizado: ${formatShortcutForDisplay(state.currentShortcut)}`);
  } catch (err) {
    console.error("Erro ao salvar atalho:", err);
    if (dom.shortcutError) {
      dom.shortcutError.textContent = err?.message || String(err) || "Falha ao registrar atalho";
      dom.shortcutError.style.display = "block";
    }
  }
}

if (dom.btnShortcutConfig) {
  dom.btnShortcutConfig.addEventListener("click", openShortcutModal);
}
if (dom.shortcutModalClose) {
  dom.shortcutModalClose.addEventListener("click", closeShortcutModal);
}
if (dom.btnShortcutCancel) {
  dom.btnShortcutCancel.addEventListener("click", closeShortcutModal);
}
if (dom.btnShortcutSave) {
  dom.btnShortcutSave.addEventListener("click", saveShortcut);
}
if (dom.shortcutModal) {
  dom.shortcutModal.addEventListener("click", (e) => {
    if (e.target === dom.shortcutModal) closeShortcutModal();
  });
}

if (dom.shortcutPresetsList) {
  dom.shortcutPresetsList.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset-pill");
    if (!btn) return;
    const shortcut = btn.dataset.shortcut;
    if (shortcut) {
      setPendingShortcut(shortcut);
      if (dom.shortcutRecorder) {
        dom.shortcutRecorder.classList.remove("recording");
      }
      if (dom.recorderHint) {
        dom.recorderHint.textContent = "Clique para gravar";
      }
      state.isRecordingShortcut = false;
    }
  });
}

if (dom.shortcutRecorder) {
  dom.shortcutRecorder.addEventListener("click", () => {
    state.isRecordingShortcut = true;
    dom.shortcutRecorder.classList.add("recording");
    if (dom.recorderHint) {
      dom.recorderHint.textContent = "Pressione as teclas no teclado...";
    }
    dom.shortcutRecorder.focus();
  });

  dom.shortcutRecorder.addEventListener("blur", () => {
    state.isRecordingShortcut = false;
    dom.shortcutRecorder.classList.remove("recording");
    if (dom.recorderHint) {
      dom.recorderHint.textContent = "Clique para gravar";
    }
  });

  dom.shortcutRecorder.addEventListener("keydown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      closeShortcutModal();
      return;
    }

    if (e.key === "Enter") {
      saveShortcut();
      return;
    }

    const hasCtrl = e.ctrlKey || e.metaKey;
    const hasAlt = e.altKey;
    const hasShift = e.shiftKey;

    // Se pressionou apenas uma tecla modificadora pura, aguardar próxima tecla
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
      return;
    }

    let key = e.key;
    if (e.code === "Space" || key === " " || key === "Spacebar") {
      key = "Space";
    } else if (/^[a-zA-Z]$/.test(key)) {
      key = key.toUpperCase();
    } else if (/^F([1-9]|1[0-2])$/i.test(key)) {
      key = key.toUpperCase();
    } else if (/^[0-9]$/.test(key)) {
      key = key;
    }

    const isFunctionKey = /^F([1-9]|1[0-2])$/i.test(key);

    if (!hasCtrl && !hasAlt && !isFunctionKey) {
      if (dom.shortcutError) {
        dom.shortcutError.textContent = "O atalho deve incluir Ctrl ou Alt (ex: Ctrl + Espaço, Alt + K) ou teclas F1-F12.";
        dom.shortcutError.style.display = "block";
      }
      return;
    }

    const parts = [];
    if (hasCtrl) parts.push("CommandOrControl");
    if (hasAlt) parts.push("Alt");
    if (hasShift) parts.push("Shift");
    parts.push(key);

    const shortcutStr = parts.join("+");
    setPendingShortcut(shortcutStr);
    state.isRecordingShortcut = false;
    dom.shortcutRecorder.classList.remove("recording");
    if (dom.recorderHint) {
      dom.recorderHint.textContent = "Atalho capturado!";
    }
  });
}

// Atalhos de Teclado
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (dom.shortcutModal && dom.shortcutModal.style.display === "flex") {
      closeShortcutModal();
    } else if (dom.deleteModal.style.display === "flex") {
      closeDeleteModal();
    } else if (dom.viewModal && dom.viewModal.style.display === "flex") {
      closeViewModal();
    } else if (dom.modal.style.display === "flex") {
      closeModal();
    } else if (!state.isPinned) {
      invoke("hide_window").catch(() => {});
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    e.preventDefault();
    openNewTaskModal();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
    e.preventDefault();
    toggleTheme();
  }
});

// Atualizar ao Ganhar Foco
window.addEventListener("focus", () => {
  loadTasks(true);
});

// Inicialização Principal
async function bootstrap() {
  await initTauriApi();

  // Aplica o tema salvo no carregamento
  applyTheme(state.currentTheme, false);

  // Obter atalho global ativo
  try {
    const sc = await invoke("get_current_shortcut");
    if (sc && typeof sc === "string") {
      state.currentShortcut = sc;
      if (dom.btnShortcutConfig) {
        dom.btnShortcutConfig.textContent = formatShortcutForDisplay(sc);
      }
    }
  } catch (err) {
    console.error("Erro ao carregar atalho global:", err);
  }

  // Obter estado inicial de fixação se disponível
  try {
    const pinned = await invoke("get_pinned");
    state.isPinned = !!pinned;
    dom.btnPinWindow.classList.toggle("pinned", state.isPinned);
  } catch {}

  // Escutar eventos emitidos pelo backend do Rust (mudança no tasks.json por IA ou sistema)
  if (listenTauri) {
    listenTauri("tasks-changed", () => {
      loadTasks(true);
      showToast("Sincronizado com tasks.json");
    });
    listenTauri("tasks-updated", () => {
      loadTasks(true);
    });
    listenTauri("autostart-changed", (event) => {
      const enabled = event.payload;
      showToast(enabled ? "🚀 Início automático ativado" : "⏸️ Início automático desativado");
    });
  }

  await loadTasks(true);
}

bootstrap();
