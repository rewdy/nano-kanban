export function renderDashboard(opts: { statePath: string }): string {
  return DASHBOARD_TEMPLATE.replace("__STATE_PATH__", escapeHtml(opts.statePath));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const DASHBOARD_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>nano-kanban</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fafaf8;
    --panel: #ffffff;
    --border: #e4e4e0;
    --text: #1a1a1a;
    --muted: #6b6b66;
    --accent: #2563eb;
    --flare-bg: #fff4e0;
    --flare-border: #f59e0b;
    --flare-text: #92400e;
    --blocked: #9ca3af;
    --done-bg: #f3f4ee;
    --comment-bg: #f6f6f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f10;
      --panel: #17181a;
      --border: #2a2b2e;
      --text: #e8e8e6;
      --muted: #9a9a94;
      --accent: #60a5fa;
      --flare-bg: #3a2a0d;
      --flare-border: #f59e0b;
      --flare-text: #fcd34d;
      --blocked: #5a5b60;
      --done-bg: #131415;
      --comment-bg: #1f2023;
    }
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #fafaf8;
    --panel: #ffffff;
    --border: #e4e4e0;
    --text: #1a1a1a;
    --muted: #6b6b66;
    --accent: #2563eb;
    --flare-bg: #fff4e0;
    --flare-border: #f59e0b;
    --flare-text: #92400e;
    --blocked: #9ca3af;
    --done-bg: #f3f4ee;
    --comment-bg: #f6f6f2;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0f0f10;
    --panel: #17181a;
    --border: #2a2b2e;
    --text: #e8e8e6;
    --muted: #9a9a94;
    --accent: #60a5fa;
    --flare-bg: #3a2a0d;
    --flare-border: #f59e0b;
    --flare-text: #fcd34d;
    --blocked: #5a5b60;
    --done-bg: #131415;
    --comment-bg: #1f2023;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header.site { padding: 14px 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--border); }
  header.site h1 { font-size: 15px; font-weight: 600; letter-spacing: 0.01em; margin: 0; }
  header.site .meta { font-size: 12px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  header.site .spacer { margin-left: auto; }
  header.site .status { font-size: 12px; color: var(--muted); }
  header.site .status.connected::before { content: "● "; color: #22c55e; }
  header.site .status.disconnected::before { content: "● "; color: #ef4444; }
  .theme-switcher { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--panel); }
  .theme-switcher button { border: none; background: transparent; color: var(--muted); font: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer; }
  .theme-switcher button + button { border-left: 1px solid var(--border); }
  .theme-switcher button[aria-pressed="true"] { background: var(--bg); color: var(--text); font-weight: 600; }
  .theme-switcher button:hover:not([aria-pressed="true"]) { color: var(--text); }
  main { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; padding: 16px; }
  .column { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; min-height: 60vh; }
  .column header.col-header { border: none; padding: 12px 14px; display: flex; align-items: center; gap: 8px; }
  .col-header h2 { font-size: 13px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .col-header .count { font-size: 12px; color: var(--muted); background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px; }
  .cards { padding: 4px 10px 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .card.done { background: var(--done-bg); }
  .card.needs-human { border-color: var(--flare-border); background: var(--flare-bg); }
  .card.needs-human .title { color: var(--flare-text); }
  .card .title { font-size: 14px; line-height: 1.35; font-weight: 500; }
  .card .meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .card .id { opacity: 0.6; }
  .badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .badge.assignee { border-color: var(--accent); color: var(--accent); }
  .badge.blocked { border-color: var(--blocked); color: var(--blocked); }
  .badge.flare { border-color: var(--flare-border); color: var(--flare-text); background: transparent; font-weight: 600; }
  button.badge { cursor: pointer; font: inherit; font-size: 11px; }
  button.badge:hover { border-color: var(--accent); color: var(--accent); }
  button.badge[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); }
  .reason { font-size: 12px; color: var(--flare-text); font-style: italic; line-height: 1.35; }
  .comments { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; padding: 8px 10px; background: var(--comment-bg); border: 1px solid var(--border); border-radius: 4px; }
  .comment { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.4; }
  .comment .head { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: var(--muted); display: flex; gap: 6px; align-items: baseline; }
  .comment .head .author { color: var(--text); font-weight: 600; }
  .comment .body { color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .comment.system .body { color: var(--flare-text); font-style: italic; }
  .empty { padding: 12px 14px; font-size: 12px; color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<header class="site">
  <h1>nano-kanban</h1>
  <span class="meta" id="source">__STATE_PATH__</span>
  <span class="spacer"></span>
  <div class="theme-switcher" role="group" aria-label="Theme">
    <button data-theme-btn="system">System</button>
    <button data-theme-btn="light">Light</button>
    <button data-theme-btn="dark">Dark</button>
  </div>
  <span class="status disconnected" id="conn">connecting…</span>
</header>
<main>
  <section class="column" data-status="todo">
    <header class="col-header"><h2>Todo</h2><span class="count" data-count></span></header>
    <div class="cards" data-cards></div>
  </section>
  <section class="column" data-status="in_progress">
    <header class="col-header"><h2>In Progress</h2><span class="count" data-count></span></header>
    <div class="cards" data-cards></div>
  </section>
  <section class="column" data-status="done">
    <header class="col-header"><h2>Done</h2><span class="count" data-count></span></header>
    <div class="cards" data-cards></div>
  </section>
</main>
<script>
  const THEME_KEY = "nano-kanban:theme";
  const expanded = new Set();
  let currentBoard = null;

  // --- theme ---
  function applyTheme(theme) {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    for (const btn of document.querySelectorAll("[data-theme-btn]")) {
      btn.setAttribute("aria-pressed", btn.dataset.themeBtn === theme ? "true" : "false");
    }
  }
  const storedTheme = localStorage.getItem(THEME_KEY) || "system";
  applyTheme(storedTheme);
  for (const btn of document.querySelectorAll("[data-theme-btn]")) {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.themeBtn;
      localStorage.setItem(THEME_KEY, choice);
      applyTheme(choice);
    });
  }

  // --- rendering ---
  const conn = document.getElementById("conn");
  const columns = Object.fromEntries(
    Array.from(document.querySelectorAll(".column")).map((col) => [col.dataset.status, col])
  );

  function render(board) {
    const grouped = { todo: [], in_progress: [], done: [] };
    for (const task of board.tasks) (grouped[task.status] ||= []).push(task);

    const liveIds = new Set(board.tasks.map((t) => t.id));
    for (const id of Array.from(expanded)) if (!liveIds.has(id)) expanded.delete(id);

    for (const status of Object.keys(columns)) {
      const col = columns[status];
      const cardsEl = col.querySelector("[data-cards]");
      const countEl = col.querySelector("[data-count]");
      const tasks = grouped[status] || [];

      tasks.sort((a, b) => {
        if ((b.needs_human ? 1 : 0) - (a.needs_human ? 1 : 0) !== 0) {
          return (b.needs_human ? 1 : 0) - (a.needs_human ? 1 : 0);
        }
        return b.updated_at.localeCompare(a.updated_at);
      });

      countEl.textContent = String(tasks.length);
      cardsEl.innerHTML = "";

      if (tasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "—";
        cardsEl.appendChild(empty);
        continue;
      }

      for (const task of tasks) cardsEl.appendChild(renderCard(task));
    }
  }

  function renderCard(task) {
    const card = document.createElement("article");
    card.className = "card " + task.status + (task.needs_human ? " needs-human" : "");

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = task.title;
    card.appendChild(title);

    if (task.needs_human) {
      const lastSystem = [...task.comments].reverse().find((c) => c.author === "system" && c.body.startsWith("needs human:"));
      if (lastSystem) {
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = lastSystem.body.replace(/^needs human:\\s*/, "");
        card.appendChild(reason);
      }
    }

    const metaRow = document.createElement("div");
    metaRow.className = "meta-row";

    const idEl = document.createElement("span");
    idEl.className = "id";
    idEl.textContent = task.id;
    metaRow.appendChild(idEl);

    if (task.needs_human) metaRow.appendChild(badge("flare", "needs human"));
    if (task.assignee) metaRow.appendChild(badge("assignee", "@" + task.assignee));

    const openBlockers = (task.blocked_by || []).filter((bid) => {
      const b = (currentBoard?.tasks || []).find((t) => t.id === bid);
      return !b || b.status !== "done";
    });
    if (openBlockers.length > 0) metaRow.appendChild(badge("blocked", "blocked by " + openBlockers.length));

    if (task.comments.length > 0) {
      const isOpen = expanded.has(task.id);
      const toggle = document.createElement("button");
      toggle.className = "badge";
      toggle.type = "button";
      toggle.textContent = (isOpen ? "▾ " : "▸ ") + task.comments.length + " 💬";
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      toggle.addEventListener("click", () => {
        if (expanded.has(task.id)) expanded.delete(task.id);
        else expanded.add(task.id);
        if (currentBoard) render(currentBoard);
      });
      metaRow.appendChild(toggle);
    }

    card.appendChild(metaRow);

    if (task.comments.length > 0 && expanded.has(task.id)) {
      card.appendChild(renderComments(task.comments));
    }

    return card;
  }

  function renderComments(comments) {
    const wrap = document.createElement("div");
    wrap.className = "comments";
    for (const c of comments) {
      const el = document.createElement("div");
      el.className = "comment" + (c.author === "system" ? " system" : "");
      const head = document.createElement("div");
      head.className = "head";
      const author = document.createElement("span");
      author.className = "author";
      author.textContent = c.author;
      const at = document.createElement("span");
      at.textContent = formatTime(c.at);
      head.appendChild(author);
      head.appendChild(at);
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = c.body;
      el.appendChild(head);
      el.appendChild(body);
      wrap.appendChild(el);
    }
    return wrap;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
    } catch { return iso; }
  }

  function badge(kind, text) {
    const el = document.createElement("span");
    el.className = "badge" + (kind ? " " + kind : "");
    el.textContent = text;
    return el;
  }

  const es = new EventSource("/events");
  es.onopen = () => {
    conn.textContent = "connected";
    conn.classList.remove("disconnected");
    conn.classList.add("connected");
  };
  es.onmessage = (ev) => {
    try {
      currentBoard = JSON.parse(ev.data);
      render(currentBoard);
    } catch (err) { console.error("bad event", err); }
  };
  es.onerror = () => {
    conn.textContent = "disconnected";
    conn.classList.remove("connected");
    conn.classList.add("disconnected");
  };
</script>
</body>
</html>
`;
