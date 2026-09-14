const KEY = "fold-budget-v1";
const CATS = {
  expense: ["Rent", "Utilities", "Groceries", "Gas", "Food out", "Phone", "Insurance", "Debt payment", "Medical", "Kids", "Fun", "Other"],
  income: ["Paycheck", "Tips", "Side hustle", "Transfer in", "Other income"],
};
const ICO = {
  Rent: "HM", Utilities: "UT", Groceries: "GR", Gas: "GS", "Food out": "FD", Phone: "PH",
  Insurance: "IN", "Debt payment": "DB", Medical: "MD", Kids: "KD", Fun: "FN", Other: "OT",
  Paycheck: "PY", Tips: "TP", "Side hustle": "SH", "Transfer in": "IN", "Other income": "IN", Transfer: "MV",
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const money = (n) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const monthKey = (d) => String(d || "").slice(0, 7);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function seed() { return { accounts: [], tx: [], budgets: {} }; }
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } }
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
let state = load();
if (!state.accounts) state = seed();
let txFilter = "all";
function accountBalance(id) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return 0;
  let bal = Number(a.start) || 0;
  for (const t of state.tx) {
    if (t.kind === "transfer") {
      if (t.accountId === id) bal -= t.amount;
      if (t.toAccountId === id) bal += t.amount;
    } else if (t.accountId === id) bal += t.kind === "income" ? t.amount : -t.amount;
  }
  return bal;
}
function shownBal(a) { const b = accountBalance(a.id); return a.type === "credit" ? -Math.abs(b) : b; }
function netWorth() { return state.accounts.reduce((s, a) => s + shownBal(a), 0); }
function currentMonth() { return $("#monthPick").value || new Date().toISOString().slice(0, 7); }
function monthTx(ym) { return state.tx.filter((t) => monthKey(t.date) === ym && t.kind !== "transfer"); }
function acctName(id) { return (state.accounts.find((a) => a.id === id) || {}).name || "—"; }
function fillCats(sel, kind) { sel.innerHTML = (CATS[kind] || CATS.expense).map((c) => `<option>${c}</option>`).join(""); }
function fillAccounts(sel) { sel.innerHTML = state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join(""); }
function monthsOptions() {
  const set = new Set(state.tx.map((t) => monthKey(t.date)));
  set.add(new Date().toISOString().slice(0, 7));
  return [...set].sort().reverse();
}
function prettyMonth(ym) { const [y, m] = ym.split("-"); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; }
function txRow(t) {
  const label = t.kind === "transfer" ? `${acctName(t.accountId)} → ${acctName(t.toAccountId)}` : `${t.category}${t.note ? " · " + t.note : ""}`;
  const cls = t.kind === "income" ? "pos" : t.kind === "expense" ? "neg" : "";
  const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
  return `<li><div class="row-main"><span class="avatar">${ICO[t.category] || "TX"}</span><div><b>${label}</b><div class="meta">${t.date} · ${acctName(t.accountId)}</div></div></div><div><span class="amt ${cls}">${sign}${money(t.amount)}</span><button class="ghost-mini" data-del-tx="${t.id}" type="button">Remove</button></div></li>`;
}
function renderMonths() {
  const sel = $("#monthPick");
  const cur = sel.value || new Date().toISOString().slice(0, 7);
  sel.innerHTML = monthsOptions().map((m) => `<option value="${m}">${prettyMonth(m)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  $("#monthLabel").textContent = prettyMonth(sel.value).split(" ")[0];
}
function renderHome() {
  const ym = currentMonth();
  const list = monthTx(ym);
  const inc = list.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0);
  const exp = list.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0);
  $("#leftThisMonth").textContent = money(inc - exp);
  $("#incAmt").textContent = "+" + money(inc);
  $("#expAmt").textContent = "−" + money(exp);
  const max = Math.max(inc + exp, 1);
  $("#incBar").style.width = `${(inc / max) * 100}%`;
  $("#flowLabel").textContent = state.accounts.length ? `${state.accounts.length} wallets · ${money(netWorth())} combined` : "Add a wallet, then log your first paycheck";
  const hour = new Date().getHours();
  $("#greet").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  $("#acctStrip").innerHTML = state.accounts.length ? state.accounts.map((a) => { const n = shownBal(a); return `<article class="mini-card"><em>${a.type}</em><span>${a.name}</span><b class="${n < 0 ? "amt neg" : ""}">${money(n)}</b></article>`; }).join("") : `<article class="mini-card"><em>Start</em><span>No wallets yet</span><b>—</b></article>`;
  const byCat = {};
  for (const t of list.filter((t) => t.kind === "expense")) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $("#catBreakdown").innerHTML = rows.length ? rows.map(([c, n]) => `<li><div class="row-main"><span class="avatar">${ICO[c] || "SP"}</span><b>${c}</b></div><span class="amt neg">${money(n)}</span></li>`).join("") : `<li class="empty">No spending logged this month.</li>`;
  const recent = [...state.tx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $("#recentList").innerHTML = recent.length ? recent.map(txRow).join("") : `<li class="empty">Nothing yet. Tap + to add.</li>`;
}
function renderTx() {
  fillAccounts($("#txForm [name=accountId]"));
  fillAccounts($("#txForm [name=toAccountId]"));
  const kind = $("#txForm [name=kind]:checked").value;
  fillCats($("#txForm [name=category]"), kind === "income" ? "income" : "expense");
  $$(".transfer-only").forEach((el) => el.classList.toggle("hidden", kind !== "transfer"));
  $$(".not-transfer").forEach((el) => el.classList.toggle("hidden", kind === "transfer"));
  let list = [...state.tx].sort((a, b) => b.date.localeCompare(a.date));
  if (txFilter !== "all") list = list.filter((t) => t.kind === txFilter);
  $("#txList").innerHTML = list.length ? list.map(txRow).join("") : `<li class="empty">No activity in this filter.</li>`;
}
function renderAccounts() {
  $("#acctList").innerHTML = state.accounts.length ? state.accounts.map((a) => { const n = shownBal(a); return `<li><div class="row-main"><span class="avatar">${a.name.slice(0, 2).toUpperCase()}</span><div><b>${a.name}</b><div class="meta">${a.type}</div></div></div><div><span class="amt ${n < 0 ? "neg" : "pos"}">${money(n)}</span><button class="ghost-mini" data-del-acct="${a.id}" type="button">Remove</button></div></li>`; }).join("") : `<li class="empty">Add checking, cash, or cards.</li>`;
}
function renderBudgets() {
  fillCats($("#budgetForm [name=category]"), "expense");
  const spent = {};
  for (const t of monthTx(currentMonth()).filter((t) => t.kind === "expense")) spent[t.category] = (spent[t.category] || 0) + t.amount;
  const cats = Object.keys(state.budgets);
  $("#budgetList").innerHTML = cats.length ? cats.map((c) => { const limit = state.budgets[c]; const use = spent[c] || 0; const pct = limit ? Math.min(100, (use / limit) * 100) : 0; return `<li style="display:block"><div style="display:flex;justify-content:space-between;align-items:center"><div class="row-main"><span class="avatar">${ICO[c] || "PL"}</span><b>${c}</b></div><span>${money(use)} / ${money(limit)}</span></div><div class="progress ${use > limit ? "over" : ""}"><i style="width:${pct}%"></i></div><button class="ghost-mini" data-del-budget="${c}" type="button">Remove</button></li>`; }).join("") : `<li class="empty">Set a cap for groceries, gas, or fun.</li>`;
}
function renderAll() { renderMonths(); renderHome(); renderTx(); renderAccounts(); renderBudgets(); }
function showView(name) {
  $$(".view").forEach((v) => v.classList.remove("on"));
  $$(".dock-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  $("#view-" + name).classList.add("on");
}
function openModal() {
  if (!state.accounts.length) { showView("accounts"); return alert("Add an account first."); }
  $("#overlay").hidden = false;
}
function closeModal() { $("#overlay").hidden = true; }
$$(".dock-btn").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
$$("[data-go]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.go)));
$("#fab").addEventListener("click", openModal);
$("#closeModal").addEventListener("click", closeModal);
$("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
$("#txForm").addEventListener("change", (e) => {
  if (e.target.name === "kind") {
    $$("#txForm .seg label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
    renderTx();
  }
});
$$(".chip").forEach((c) => c.addEventListener("click", () => {
  txFilter = c.dataset.filter;
  $$(".chip").forEach((x) => x.classList.toggle("on", x === c));
  renderTx();
}));
$("#txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const kind = f.kind.value;
  const amount = Math.abs(Number(f.amount.value));
  if (!amount) return;
  state.tx.push({ id: uid(), kind, amount, accountId: f.accountId.value, toAccountId: kind === "transfer" ? f.toAccountId.value : null, category: kind === "transfer" ? "Transfer" : f.category.value, note: f.note.value.trim(), date: f.date.value, created: new Date().toISOString() });
  f.amount.value = ""; f.note.value = "";
  save(); renderAll(); closeModal();
});
$("#acctForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  state.accounts.push({ id: uid(), name: f.name.value.trim(), type: f.type.value, start: Number(f.balance.value) || 0 });
  f.reset(); save(); renderAll();
});
$("#budgetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.budgets[e.target.category.value] = Math.abs(Number(e.target.limit.value));
  save(); renderAll();
});
document.addEventListener("click", (e) => {
  const tx = e.target.dataset.delTx, ac = e.target.dataset.delAcct, bd = e.target.dataset.delBudget;
  if (tx) { state.tx = state.tx.filter((t) => t.id !== tx); save(); renderAll(); }
  if (ac) { if (!confirm("Remove this account?")) return; state.accounts = state.accounts.filter((a) => a.id !== ac); save(); renderAll(); }
  if (bd) { delete state.budgets[bd]; save(); renderAll(); }
});
$("#monthBtn").addEventListener("click", () => $("#monthPick").showPicker ? $("#monthPick").showPicker() : $("#monthPick").click());
$("#monthPick").addEventListener("change", renderAll);
$("#exportBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = "fold-backup.json"; a.click();
});
$("#txForm [name=date]").value = new Date().toISOString().slice(0, 10);
renderAll();
