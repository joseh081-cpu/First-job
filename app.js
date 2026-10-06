const KEY = "fold-budget-v1";
const CATS = {
  expense: ["Rent", "Utilities", "Groceries", "Gas", "Food out", "Phone", "Insurance", "Debt payment", "Medical", "Kids", "Fun", "Other"],
  income: ["Paycheck", "Tips", "Side hustle", "Transfer in", "Other income"],
};
const ICO = {
  Rent: "HM", Utilities: "UT", Groceries: "GR", Gas: "GS", "Food out": "FD", Phone: "PH",
  Insurance: "IN", "Debt payment": "DB", Medical: "MD", Kids: "KD", Fun: "FN", Other: "OT",
  Paycheck: "PY", Tips: "TP", "Side hustle": "SH", "Transfer in": "TI", "Other income": "OI", Transfer: "MV",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const money = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const monthKey = (d) => String(d || "").slice(0, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function seed() {
  return { accounts: [], tx: [], budgets: {} };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || seed();
  } catch {
    return seed();
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();
if (!state.accounts || !Array.isArray(state.tx) || !state.budgets) state = seed();

let txFilter = "all";
let editingId = null;

function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dayOfMonth(ym) {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (ym !== cur) return daysInMonth(ym);
  return now.getDate();
}

function accountBalance(id) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return 0;
  let bal = Number(a.start) || 0;
  for (const t of state.tx) {
    if (t.kind === "transfer") {
      if (t.accountId === id) bal -= t.amount;
      if (t.toAccountId === id) bal += t.amount;
    } else if (t.accountId === id) {
      bal += t.kind === "income" ? t.amount : -t.amount;
    }
  }
  return bal;
}

function shownBal(a) {
  const b = accountBalance(a.id);
  return a.type === "credit" ? -Math.abs(b) : b;
}

function netWorth() {
  return state.accounts.reduce((s, a) => s + shownBal(a), 0);
}

function currentMonth() {
  return $("#monthPick").value || todayISO().slice(0, 7);
}

function monthTx(ym, includeTransfers = false) {
  return state.tx.filter((t) => monthKey(t.date) === ym && (includeTransfers || t.kind !== "transfer"));
}

function monthTotals(ym) {
  const list = monthTx(ym);
  const income = list.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const expense = list.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  return { income, expense, left: income - expense, count: list.length };
}

function spentByCategory(ym) {
  const spent = {};
  for (const t of monthTx(ym).filter((t) => t.kind === "expense")) {
    spent[t.category] = (spent[t.category] || 0) + t.amount;
  }
  return spent;
}

function acctName(id) {
  return (state.accounts.find((a) => a.id === id) || {}).name || "—";
}

function fillCats(sel, kind) {
  sel.innerHTML = (CATS[kind] || CATS.expense).map((c) => `<option>${c}</option>`).join("");
}

function fillAccounts(sel) {
  sel.innerHTML = state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
}

function monthsOptions() {
  const set = new Set(state.tx.map((t) => monthKey(t.date)));
  let cur = todayISO().slice(0, 7);
  set.add(cur);
  for (let i = 0; i < 3; i++) {
    cur = shiftMonth(cur, -1);
    set.add(cur);
  }
  return [...set].sort().reverse();
}

function prettyMonth(ym) {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

function pctChange(curr, prev) {
  if (!prev) return curr ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function buildInsights(ym) {
  const tips = [];
  const cur = monthTotals(ym);
  const prevYm = shiftMonth(ym, -1);
  const prev = monthTotals(prevYm);
  const spent = spentByCategory(ym);
  const day = dayOfMonth(ym);
  const dim = daysInMonth(ym);
  const pace = day ? (cur.expense / day) * dim : 0;

  if (!state.accounts.length) {
    tips.push({ level: "warn", title: "Add a wallet", body: "Start with checking or cash so every dollar has a home." });
  }
  if (!cur.income && !cur.expense) {
    tips.push({ level: "info", title: "Log your first paycheck", body: "Income unlocks leftover tracking and daily pacing for this month." });
  }
  if (cur.income && !cur.expense) {
    tips.push({ level: "good", title: "Income is in", body: `You’ve logged ${money(cur.income)}. Tap + whenever you spend — track every purchase.` });
  }

  if (cur.expense && cur.income) {
    const rate = ((cur.income - cur.expense) / cur.income) * 100;
    if (rate < 0) {
      tips.push({ level: "warn", title: "Spending past income", body: `You’re ${money(cur.expense - cur.income)} over income this month. Pause non-essentials or add another deposit.` });
    } else if (rate < 10) {
      tips.push({ level: "warn", title: "Thin buffer", body: `Only ${rate.toFixed(0)}% of income is left. Keep fun spending on a short leash.` });
    } else {
      tips.push({ level: "good", title: "Healthy buffer", body: `${rate.toFixed(0)}% of income is still available (${money(cur.left)}).` });
    }
  }

  if (cur.expense && day < dim) {
    const projected = pace;
    if (cur.income && projected > cur.income) {
      tips.push({
        level: "warn",
        title: "Pace runs hot",
        body: `At today’s pace you’d spend ${money(projected)} by month end — ${money(projected - cur.income)} over income.`,
      });
    } else {
      const daily = (cur.left > 0 ? cur.left : 0) / Math.max(1, dim - day);
      tips.push({
        level: "info",
        title: "Daily allowance",
        body: cur.left > 0
          ? `About ${money(daily)}/day keeps you on track for the rest of ${prettyMonth(ym)}.`
          : "No leftover left — only essential spending until the next paycheck.",
      });
    }
  }

  if (prev.expense || prev.income) {
    const delta = pctChange(cur.expense, prev.expense);
    if (prev.expense) {
      tips.push({
        level: delta > 15 ? "warn" : delta < -10 ? "good" : "info",
        title: "Month-to-month spend",
        body: delta >= 0
          ? `Spending is ${Math.abs(delta).toFixed(0)}% higher than ${prettyMonth(prevYm)} (${money(prev.expense)} → ${money(cur.expense)}).`
          : `Nice — spending is ${Math.abs(delta).toFixed(0)}% lower than ${prettyMonth(prevYm)}.`,
      });
    }
  }

  const hot = Object.entries(state.budgets)
    .map(([c, limit]) => ({ c, limit, use: spent[c] || 0, pct: limit ? (spent[c] || 0) / limit : 0 }))
    .filter((x) => x.pct >= 0.8)
    .sort((a, b) => b.pct - a.pct);

  for (const h of hot.slice(0, 3)) {
    tips.push({
      level: h.use > h.limit ? "warn" : "info",
      title: h.use > h.limit ? `${h.c} over limit` : `${h.c} nearly full`,
      body: `${money(h.use)} of ${money(h.limit)} used (${Math.round(h.pct * 100)}%).`,
    });
  }

  if (!Object.keys(state.budgets).length && cur.expense) {
    tips.push({ level: "info", title: "Set category caps", body: "Plans turn raw spending into guardrails. Start with Groceries, Gas, and Fun." });
  }

  const top = Object.entries(spent).sort((a, b) => b[1] - a[1])[0];
  if (top && cur.expense) {
    tips.push({
      level: "info",
      title: `Biggest slice: ${top[0]}`,
      body: `${money(top[1])} — ${Math.round((top[1] / cur.expense) * 100)}% of this month’s outflow.`,
    });
  }

  if (!tips.length) {
    tips.push({ level: "info", title: "Ready when you are", body: "Add wallets, log paychecks, and track every expense. I’ll coach from there." });
  }

  return { tips, cur, prev, prevYm, pace, day, dim };
}

function txRow(t) {
  const label = t.kind === "transfer"
    ? `${acctName(t.accountId)} → ${acctName(t.toAccountId)}`
    : `${t.category}${t.note ? " · " + t.note : ""}`;
  const cls = t.kind === "income" ? "pos" : t.kind === "expense" ? "neg" : "";
  const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
  return `<li>
    <div class="row-main">
      <span class="avatar">${ICO[t.category] || "TX"}</span>
      <div><b>${label}</b><div class="meta">${t.date} · ${acctName(t.accountId)}</div></div>
    </div>
    <div class="row-side">
      <span class="amt ${cls}">${sign}${money(t.amount)}</span>
      <div class="row-actions">
        <button class="ghost-mini" data-edit-tx="${t.id}" type="button">Edit</button>
        <button class="ghost-mini" data-del-tx="${t.id}" type="button">Remove</button>
      </div>
    </div>
  </li>`;
}

function renderMonths() {
  const sel = $("#monthPick");
  const cur = sel.value || todayISO().slice(0, 7);
  const opts = new Set(monthsOptions());
  opts.add(cur);
  sel.innerHTML = [...opts].sort().reverse().map((m) => `<option value="${m}">${prettyMonth(m)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else sel.value = todayISO().slice(0, 7);
  $("#monthLabel").textContent = prettyMonth(sel.value).split(" ")[0];
}

function renderHome() {
  const ym = currentMonth();
  const { income: inc, expense: exp, left } = monthTotals(ym);
  const prev = monthTotals(shiftMonth(ym, -1));
  const day = dayOfMonth(ym);
  const dim = daysInMonth(ym);

  $("#leftThisMonth").textContent = money(left);
  $("#incAmt").textContent = "+" + money(inc);
  $("#expAmt").textContent = "−" + money(exp);
  const max = Math.max(inc + exp, 1);
  $("#incBar").style.width = `${(inc / max) * 100}%`;
  $("#flowLabel").textContent = state.accounts.length
    ? `${state.accounts.length} wallets · ${money(netWorth())} combined`
    : "Add a wallet, then log your first paycheck";

  const hour = new Date().getHours();
  $("#greet").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const mom = $("#momStrip");
  if (exp || prev.expense) {
    mom.hidden = false;
    const delta = pctChange(exp, prev.expense);
    const arrow = delta > 1 ? "↑" : delta < -1 ? "↓" : "→";
    $("#momSpend").textContent = prev.expense
      ? `${arrow} ${Math.abs(delta).toFixed(0)}% vs ${prettyMonth(shiftMonth(ym, -1)).split(" ")[0]}`
      : "First month of tracking";
    const projected = day ? (exp / day) * dim : 0;
    $("#momPace").textContent = day < dim && exp
      ? `Pace ${money(projected)} / mo`
      : `${day}/${dim} days in`;
  } else {
    mom.hidden = true;
  }

  const { tips } = buildInsights(ym);
  $("#agentTeaserText").textContent = tips[0].body;

  $("#acctStrip").innerHTML = state.accounts.length
    ? state.accounts.map((a) => {
      const n = shownBal(a);
      return `<article class="mini-card"><em>${a.type}</em><span>${a.name}</span><b class="${n < 0 ? "amt neg" : ""}">${money(n)}</b></article>`;
    }).join("")
    : `<article class="mini-card"><em>Start</em><span>No wallets yet</span><b>—</b></article>`;

  const byCat = spentByCategory(ym);
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("#catBreakdown").innerHTML = rows.length
    ? rows.map(([c, n]) => {
      const limit = state.budgets[c];
      const bar = limit ? clamp((n / limit) * 100, 0, 100) : 0;
      return `<li class="cat-row">
        <div class="row-main"><span class="avatar">${ICO[c] || "SP"}</span><div><b>${c}</b>${limit ? `<div class="meta">${money(n)} / ${money(limit)}</div>` : ""}</div></div>
        <span class="amt neg">${money(n)}</span>
        ${limit ? `<div class="progress ${n > limit ? "over" : ""}"><i style="width:${bar}%"></i></div>` : ""}
      </li>`;
    }).join("")
    : `<li class="empty">No spending logged this month. Tap + to track every expense.</li>`;

  const recent = [...state.tx].sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || "")).slice(0, 5);
  $("#recentList").innerHTML = recent.length
    ? recent.map(txRow).join("")
    : `<li class="empty">Nothing yet. Tap + to add.</li>`;
}

function renderTx() {
  fillAccounts($("#txForm [name=accountId]"));
  fillAccounts($("#txForm [name=toAccountId]"));
  const kind = $("#txForm [name=kind]:checked").value;
  fillCats($("#txForm [name=category]"), kind === "income" ? "income" : "expense");
  $$(".transfer-only").forEach((el) => el.classList.toggle("hidden", kind !== "transfer"));
  $$(".not-transfer").forEach((el) => el.classList.toggle("hidden", kind === "transfer"));

  const q = ($("#txSearch").value || "").trim().toLowerCase();
  const monthOnly = $("#monthOnly").checked;
  const ym = currentMonth();

  let list = [...state.tx].sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""));
  if (monthOnly) list = list.filter((t) => monthKey(t.date) === ym);
  if (txFilter !== "all") list = list.filter((t) => t.kind === txFilter);
  if (q) {
    list = list.filter((t) => {
      const hay = [t.category, t.note, acctName(t.accountId), acctName(t.toAccountId), t.kind, String(t.amount), t.date]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  $("#txList").innerHTML = list.length
    ? list.map(txRow).join("")
    : `<li class="empty">${q ? "No matches." : "No activity in this filter."}</li>`;
}

function renderAgent() {
  const ym = currentMonth();
  const { tips, cur, prev, prevYm, pace, day, dim } = buildInsights(ym);
  const daily = Math.max(1, dim - day + (day === dim ? 1 : 0));
  const allow = cur.left > 0 ? cur.left / Math.max(1, dim - day || 1) : 0;

  $("#agentHeadline").textContent = cur.expense || cur.income
    ? `${prettyMonth(ym)} at a glance`
    : "Let’s map this month";
  $("#agentSummary").textContent = tips[0].body;

  $("#agentStats").innerHTML = `
    <article><em>Left</em><b class="${cur.left < 0 ? "neg" : ""}">${money(cur.left)}</b></article>
    <article><em>Entries</em><b>${cur.count}</b></article>
    <article><em>vs ${prettyMonth(prevYm).split(" ")[0]}</em><b>${prev.expense ? ((pctChange(cur.expense, prev.expense) >= 0 ? "+" : "") + pctChange(cur.expense, prev.expense).toFixed(0) + "%") : "—"}</b></article>
    <article><em>Daily left</em><b>${money(allow)}</b></article>
    <article><em>Projected spend</em><b>${money(pace)}</b></article>
    <article><em>Day</em><b>${day}/${dim}</b></article>
  `;

  $("#insightList").innerHTML = tips.map((t) => `
    <li class="insight ${t.level}">
      <div class="row-main">
        <span class="avatar">${t.level === "warn" ? "!" : t.level === "good" ? "OK" : "i"}</span>
        <div><b>${t.title}</b><div class="meta">${t.body}</div></div>
      </div>
    </li>
  `).join("");
}

function renderAccounts() {
  $("#acctList").innerHTML = state.accounts.length
    ? state.accounts.map((a) => {
      const n = shownBal(a);
      return `<li>
        <div class="row-main">
          <span class="avatar">${a.name.slice(0, 2).toUpperCase()}</span>
          <div><b>${a.name}</b><div class="meta">${a.type}</div></div>
        </div>
        <div class="row-side">
          <span class="amt ${n < 0 ? "neg" : "pos"}">${money(n)}</span>
          <button class="ghost-mini" data-del-acct="${a.id}" type="button">Remove</button>
        </div>
      </li>`;
    }).join("")
    : `<li class="empty">Add checking, cash, or cards.</li>`;
}

function renderBudgets() {
  fillCats($("#budgetForm [name=category]"), "expense");
  const spent = spentByCategory(currentMonth());
  const cats = Object.keys(state.budgets);
  $("#budgetList").innerHTML = cats.length
    ? cats.map((c) => {
      const limit = state.budgets[c];
      const use = spent[c] || 0;
      const pct = limit ? Math.min(100, (use / limit) * 100) : 0;
      return `<li class="budget-item">
        <div class="budget-head">
          <div class="row-main"><span class="avatar">${ICO[c] || "PL"}</span><b>${c}</b></div>
          <span>${money(use)} / ${money(limit)}</span>
        </div>
        <div class="progress ${use > limit ? "over" : ""}"><i style="width:${pct}%"></i></div>
        <button class="ghost-mini" data-del-budget="${c}" type="button">Remove</button>
      </li>`;
    }).join("")
    : `<li class="empty">Set a cap for groceries, gas, or fun.</li>`;
}

function renderAll() {
  renderMonths();
  renderHome();
  renderTx();
  renderAgent();
  renderAccounts();
  renderBudgets();
}

function showView(name) {
  $$(".view").forEach((v) => v.classList.remove("on"));
  $$(".dock-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  const el = $("#view-" + name);
  if (el) el.classList.add("on");
  if (name === "accounts") {
    // accounts is off-dock; highlight none extra
  }
}

function syncSeg() {
  $$("#txForm .seg label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
}

function openModal(editTx = null) {
  if (!state.accounts.length) {
    showView("accounts");
    alert("Add an account first.");
    return;
  }
  editingId = editTx ? editTx.id : null;
  const f = $("#txForm");
  $("#txModalTitle").textContent = editTx ? "Edit entry" : "New entry";
  f.editId.value = editTx ? editTx.id : "";
  if (editTx) {
    f.kind.value = editTx.kind;
    f.amount.value = editTx.amount;
    f.note.value = editTx.note || "";
    f.date.value = editTx.date;
  } else {
    f.amount.value = "";
    f.note.value = "";
    f.date.value = todayISO();
    f.kind.value = "expense";
  }
  syncSeg();
  renderTx();
  if (editTx) {
    f.accountId.value = editTx.accountId;
    if (editTx.toAccountId) f.toAccountId.value = editTx.toAccountId;
    if (editTx.kind !== "transfer") f.category.value = editTx.category;
  }
  $("#overlay").hidden = false;
}

function closeModal() {
  $("#overlay").hidden = true;
  editingId = null;
}

function copyLastMonthBudgets() {
  const ym = currentMonth();
  const prevYm = shiftMonth(ym, -1);
  const prevSpent = spentByCategory(prevYm);
  const keys = Object.keys(state.budgets);
  if (keys.length) {
    if (!confirm("Replace current limits with rounded spend from last month’s categories?")) return;
  }
  const next = { ...state.budgets };
  const source = keys.length ? keys : Object.keys(prevSpent);
  if (!source.length && !Object.keys(prevSpent).length) {
    alert("No last-month spending to copy yet.");
    return;
  }
  for (const c of new Set([...source, ...Object.keys(prevSpent)])) {
    const base = prevSpent[c] || state.budgets[c] || 0;
    if (base > 0) next[c] = Math.ceil(base / 10) * 10;
  }
  state.budgets = next;
  save();
  renderAll();
  showView("budgets");
}

function loadSampleMonth() {
  if (state.tx.length && !confirm("This adds a sample checking account and a month of demo activity. Continue?")) return;
  const checking = state.accounts.find((a) => a.type === "checking") || {
    id: uid(), name: "Everyday checking", type: "checking", start: 1840,
  };
  if (!state.accounts.find((a) => a.id === checking.id)) state.accounts.push(checking);
  const ym = currentMonth();
  const d = (n) => `${ym}-${String(n).padStart(2, "0")}`;
  const demo = [
    { kind: "income", amount: 3200, category: "Paycheck", note: "Biweekly pay", date: d(1) },
    { kind: "expense", amount: 1450, category: "Rent", note: "Apartment", date: d(2) },
    { kind: "expense", amount: 118.4, category: "Utilities", note: "Electric + water", date: d(3) },
    { kind: "expense", amount: 86.22, category: "Groceries", note: "Weekly shop", date: d(4) },
    { kind: "expense", amount: 42.5, category: "Gas", note: "Fill-up", date: d(5) },
    { kind: "expense", amount: 28.75, category: "Food out", note: "Lunch", date: d(6) },
    { kind: "expense", amount: 64.1, category: "Groceries", note: "Midweek", date: d(8) },
    { kind: "expense", amount: 15.99, category: "Fun", note: "Streaming", date: d(9) },
    { kind: "expense", amount: 55, category: "Gas", note: "Commute", date: d(Math.min(12, daysInMonth(ym))) },
  ];
  for (const t of demo) {
    state.tx.push({
      id: uid(),
      ...t,
      accountId: checking.id,
      toAccountId: null,
      created: new Date().toISOString(),
    });
  }
  state.budgets = {
    Groceries: 350,
    Gas: 160,
    "Food out": 120,
    Fun: 80,
    Utilities: 150,
  };
  // pretend previous month a bit lighter for MoM tips
  const prev = shiftMonth(ym, -1);
  const pd = (n) => `${prev}-${String(n).padStart(2, "0")}`;
  state.tx.push(
    { id: uid(), kind: "income", amount: 3200, category: "Paycheck", note: "Prior pay", date: pd(1), accountId: checking.id, toAccountId: null, created: new Date().toISOString() },
    { id: uid(), kind: "expense", amount: 1450, category: "Rent", note: "Apartment", date: pd(2), accountId: checking.id, toAccountId: null, created: new Date().toISOString() },
    { id: uid(), kind: "expense", amount: 210, category: "Groceries", note: "Food", date: pd(10), accountId: checking.id, toAccountId: null, created: new Date().toISOString() },
    { id: uid(), kind: "expense", amount: 90, category: "Gas", note: "Fuel", date: pd(14), accountId: checking.id, toAccountId: null, created: new Date().toISOString() },
  );
  save();
  renderAll();
  showView("home");
}

$$(".dock-btn").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) showView(go.dataset.go);
});

$("#fab").addEventListener("click", () => openModal());
$("#closeModal").addEventListener("click", closeModal);
$("#overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") closeModal();
});

$("#txForm").addEventListener("change", (e) => {
  if (e.target.name === "kind") {
    syncSeg();
    renderTx();
  }
});

$$(".chip").forEach((c) => c.addEventListener("click", () => {
  txFilter = c.dataset.filter;
  $$(".chip").forEach((x) => x.classList.toggle("on", x === c));
  renderTx();
}));

$("#txSearch").addEventListener("input", renderTx);
$("#monthOnly").addEventListener("change", renderTx);

$("#txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const kind = f.kind.value;
  const amount = Math.abs(Number(f.amount.value));
  if (!amount) return;
  if (kind === "transfer" && f.accountId.value === f.toAccountId.value) {
    alert("Pick two different accounts to move money.");
    return;
  }
  const entry = {
    id: f.editId.value || uid(),
    kind,
    amount,
    accountId: f.accountId.value,
    toAccountId: kind === "transfer" ? f.toAccountId.value : null,
    category: kind === "transfer" ? "Transfer" : f.category.value,
    note: f.note.value.trim(),
    date: f.date.value,
    created: new Date().toISOString(),
  };
  if (f.editId.value) {
    const idx = state.tx.findIndex((t) => t.id === f.editId.value);
    if (idx >= 0) {
      entry.created = state.tx[idx].created || entry.created;
      state.tx[idx] = entry;
    } else state.tx.push(entry);
  } else {
    state.tx.push(entry);
  }
  f.amount.value = "";
  f.note.value = "";
  f.editId.value = "";
  save();
  renderAll();
  closeModal();
});

$("#acctForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  state.accounts.push({
    id: uid(),
    name: f.name.value.trim(),
    type: f.type.value,
    start: Number(f.balance.value) || 0,
  });
  f.reset();
  save();
  renderAll();
});

$("#budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.budgets[e.target.category.value] = Math.abs(Number(e.target.limit.value));
  save();
  renderAll();
});

document.addEventListener("click", (e) => {
  const delTx = e.target.dataset.delTx;
  const editTx = e.target.dataset.editTx;
  const delAc = e.target.dataset.delAcct;
  const delBd = e.target.dataset.delBudget;
  if (delTx) {
    state.tx = state.tx.filter((t) => t.id !== delTx);
    save();
    renderAll();
  }
  if (editTx) {
    const t = state.tx.find((x) => x.id === editTx);
    if (t) openModal(t);
  }
  if (delAc) {
    if (!confirm("Remove this account? Its history stays, but balances may look odd.")) return;
    state.accounts = state.accounts.filter((a) => a.id !== delAc);
    save();
    renderAll();
  }
  if (delBd) {
    delete state.budgets[delBd];
    save();
    renderAll();
  }
});

$("#monthBtn").addEventListener("click", () => {
  const sel = $("#monthPick");
  if (sel.showPicker) sel.showPicker();
  else sel.click();
});
$("#monthPick").addEventListener("change", renderAll);
$("#prevMonth").addEventListener("click", () => {
  $("#monthPick").value = shiftMonth(currentMonth(), -1);
  renderAll();
});
$("#nextMonth").addEventListener("click", () => {
  $("#monthPick").value = shiftMonth(currentMonth(), 1);
  // ensure option exists
  if (![...$("#monthPick").options].some((o) => o.value === $("#monthPick").value)) {
    const m = $("#monthPick").value;
    $("#monthPick").insertAdjacentHTML("afterbegin", `<option value="${m}">${prettyMonth(m)}</option>`);
    $("#monthPick").value = m;
  }
  renderAll();
});

$("#exportBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = `fold-backup-${todayISO()}.json`;
  a.click();
});

$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.tx) || typeof data.budgets !== "object") {
      throw new Error("bad shape");
    }
    if (!confirm("Replace all Fold data on this device with the backup?")) return;
    state = { accounts: data.accounts, tx: data.tx, budgets: data.budgets || {} };
    save();
    renderAll();
  } catch {
    alert("Could not read that backup file.");
  }
});

$("#copyBudgetsBtn").addEventListener("click", copyLastMonthBudgets);
$("#seedDemoBtn").addEventListener("click", loadSampleMonth);

$("#txForm [name=date]").value = todayISO();
renderAll();
