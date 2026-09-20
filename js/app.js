import { loadState, saveState, allSymbols } from "./store.js";
import { fetchAllQuotes } from "./quotes.js";
import { recordPriceHistory, deployedCapital, remainingBudget, buildRecommendations } from "./engine.js";

const state = loadState();

const el = (id) => document.getElementById(id);
const money = (n) => `$${Math.round(n).toLocaleString()}`;

let countdownTimer = null;
let secondsLeft = 0;

function refreshIntervalSeconds() {
  return state.refreshMinutes * 60;
}

function syncSettingsInputs() {
  el("bankrollInput").value = state.bankroll;
  el("tradingCapInput").value = state.tradingCap;
  el("dataModeSelect").value = state.dataMode;
  el("apiKeyInput").value = state.apiKey;
  el("refreshMinutesSelect").value = String(state.refreshMinutes);
  el("notificationsToggle").checked = state.notificationsEnabled;
  el("manualPricesCard").hidden = state.dataMode !== "manual";
}

function renderBudget() {
  const deployed = deployedCapital(state);
  const remaining = remainingBudget(state);
  const reserve = Math.max(0, state.bankroll - state.tradingCap);
  const pct = state.tradingCap > 0 ? Math.min(100, (deployed / state.tradingCap) * 100) : 0;
  el("budgetBarFill").style.width = `${pct}%`;
  el("deployedValue").textContent = money(deployed);
  el("remainingValue").textContent = money(remaining);
  el("reserveValue").textContent = money(reserve);
}

function renderManualPricesGrid() {
  const grid = el("manualPricesGrid");
  const symbols = allSymbols(state);
  grid.innerHTML = "";
  symbols.forEach((symbol) => {
    const label = document.createElement("label");
    label.textContent = symbol;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0";
    input.value = state.manualPrices[symbol] ?? "";
    input.addEventListener("change", () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        state.manualPrices[symbol] = val;
        saveState(state);
      }
    });
    label.appendChild(input);
    grid.appendChild(label);
  });
}

function renderHoldings(latestQuotes = {}) {
  const tbody = document.querySelector("#holdingsTable tbody");
  tbody.innerHTML = "";
  state.holdings.forEach((h) => {
    const quote = latestQuotes[h.symbol];
    const price = quote ? quote.price : h.avgCost;
    const value = price * h.shares;
    const pl = value - h.shares * h.avgCost;
    const plPct = h.avgCost ? (pl / (h.shares * h.avgCost)) * 100 : 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.symbol}</td>
      <td>${h.shares}</td>
      <td>$${h.avgCost.toFixed(2)}</td>
      <td>$${price.toFixed(2)}</td>
      <td>${money(value)}</td>
      <td class="${pl >= 0 ? "gain" : "loss"}">${pl >= 0 ? "+" : ""}${money(pl)} (${plPct.toFixed(1)}%)</td>
      <td><button class="btn-danger" data-remove-holding="${h.symbol}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-holding]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.getAttribute("data-remove-holding");
      state.holdings = state.holdings.filter((h) => h.symbol !== symbol);
      saveState(state);
      renderAll();
    });
  });
}

function renderWatchlist(latestQuotes = {}, recommendations = null) {
  const tbody = document.querySelector("#watchlistTable tbody");
  tbody.innerHTML = "";
  const bySymbol = new Map((recommendations?.items || []).map((i) => [i.symbol, i]));

  state.watchlist.forEach((symbol) => {
    const quote = latestQuotes[symbol];
    const rec = bySymbol.get(symbol);
    const price = quote ? quote.price : null;
    const changePct = quote && quote.prevClose ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${symbol}</td>
      <td>${price !== null ? "$" + price.toFixed(2) : "—"}</td>
      <td class="${changePct !== null ? (changePct >= 0 ? "gain" : "loss") : ""}">${changePct !== null ? (changePct >= 0 ? "+" : "") + changePct.toFixed(2) + "%" : "—"}</td>
      <td>${rec ? rec.score.toFixed(1) : "—"}</td>
      <td>${rec ? `<span class="signal-badge signal-${rec.type}">${rec.type}</span>` : "—"}</td>
      <td><button class="btn-danger" data-remove-watch="${symbol}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-watch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const symbol = btn.getAttribute("data-remove-watch");
      state.watchlist = state.watchlist.filter((s) => s !== symbol);
      saveState(state);
      renderAll();
    });
  });
}

function renderRecommendations(recommendations) {
  el("recommendationSummary").textContent = recommendations
    ? recommendations.summary
    : "Run an analysis to get a recommendation.";

  const list = el("recommendationList");
  list.innerHTML = "";
  if (!recommendations) return;

  recommendations.items
    .filter((i) => i.type !== "HOLD" && i.type !== "AVOID")
    .forEach((item) => {
      const div = document.createElement("div");
      div.className = `rec-item ${item.type.toLowerCase()}`;
      const main =
        item.type === "BUY" || item.type === "SELL" || item.type === "TRIM"
          ? `${item.type} ${item.shares} sh ${item.symbol} (~${money(item.dollars)})`
          : `${item.type} ${item.symbol}`;
      div.innerHTML = `
        <div>
          <div class="rec-main">${main}</div>
          <div class="rec-reason">${item.reason}</div>
        </div>
        <span class="signal-badge signal-${item.type}">${item.type}</span>
      `;
      list.appendChild(div);
    });
}

function renderHistory() {
  const container = el("historyList");
  container.innerHTML = "";
  if (state.history.length === 0) {
    container.innerHTML = '<p class="hint">No runs yet.</p>';
    return;
  }
  state.history
    .slice()
    .reverse()
    .forEach((entry) => {
      const div = document.createElement("div");
      div.className = "history-entry";
      const time = new Date(entry.ts).toLocaleString();
      div.innerHTML = `<span class="history-time">${time}</span>${entry.summary}`;
      container.appendChild(div);
    });
}

function renderAll(latestQuotes = {}, recommendations = null) {
  renderBudget();
  renderHoldings(latestQuotes);
  renderWatchlist(latestQuotes, recommendations);
  renderManualPricesGrid();
  renderRecommendations(recommendations);
  renderHistory();
}

function notify(title, body) {
  if (!state.notificationsEnabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body });
}

async function runAnalysis() {
  const runBtn = el("runNowBtn");
  runBtn.disabled = true;
  runBtn.textContent = "Analyzing…";

  try {
    const symbols = allSymbols(state);
    const { quotes, errors } = await fetchAllQuotes(symbols, state);

    Object.entries(quotes).forEach(([symbol, quote]) => {
      recordPriceHistory(state, symbol, quote);
    });

    const recommendations = buildRecommendations(state, quotes);

    state.lastRun = Date.now();
    state.history.push({ ts: state.lastRun, summary: recommendations.summary });
    if (state.history.length > 200) state.history = state.history.slice(-200);
    saveState(state);

    renderAll(quotes, recommendations);

    if (Object.keys(errors).length > 0) {
      console.warn("Quote errors:", errors);
    }

    notify("Stock Game Advisor", recommendations.summary);
  } catch (e) {
    console.error(e);
    el("recommendationSummary").textContent = `Analysis failed: ${e.message}`;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run analysis now";
    resetCountdown();
  }
}

function resetCountdown() {
  secondsLeft = refreshIntervalSeconds();
}

function tickCountdown() {
  if (secondsLeft <= 0) {
    resetCountdown();
    runAnalysis();
    return;
  }
  secondsLeft -= 1;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  el("countdownValue").textContent = `${mm}:${ss}`;
}

function startScheduler() {
  resetCountdown();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tickCountdown, 1000);
}

function bindEvents() {
  el("runNowBtn").addEventListener("click", runAnalysis);

  el("bankrollInput").addEventListener("change", () => {
    state.bankroll = Math.max(0, parseFloat(el("bankrollInput").value) || 0);
    saveState(state);
    renderBudget();
  });

  el("tradingCapInput").addEventListener("change", () => {
    state.tradingCap = Math.max(0, parseFloat(el("tradingCapInput").value) || 0);
    saveState(state);
    renderBudget();
  });

  el("dataModeSelect").addEventListener("change", () => {
    state.dataMode = el("dataModeSelect").value;
    el("manualPricesCard").hidden = state.dataMode !== "manual";
    saveState(state);
  });

  el("apiKeyInput").addEventListener("change", () => {
    state.apiKey = el("apiKeyInput").value.trim();
    saveState(state);
  });

  el("refreshMinutesSelect").addEventListener("change", () => {
    state.refreshMinutes = parseInt(el("refreshMinutesSelect").value, 10);
    saveState(state);
    startScheduler();
  });

  el("notificationsToggle").addEventListener("change", async () => {
    if (el("notificationsToggle").checked && "Notification" in window) {
      const perm = await Notification.requestPermission();
      state.notificationsEnabled = perm === "granted";
      el("notificationsToggle").checked = state.notificationsEnabled;
    } else {
      state.notificationsEnabled = false;
    }
    saveState(state);
  });

  el("addHoldingForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const symbol = el("holdingSymbol").value.trim().toUpperCase();
    const shares = parseFloat(el("holdingShares").value);
    const avgCost = parseFloat(el("holdingAvgCost").value);
    if (!symbol || !shares || !avgCost) return;

    const existing = state.holdings.find((h) => h.symbol === symbol);
    if (existing) {
      existing.shares = shares;
      existing.avgCost = avgCost;
    } else {
      state.holdings.push({ symbol, shares, avgCost });
    }
    saveState(state);
    ev.target.reset();
    renderAll();
  });

  el("addWatchForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const symbol = el("watchSymbol").value.trim().toUpperCase();
    if (!symbol || state.watchlist.includes(symbol)) return;
    state.watchlist.push(symbol);
    saveState(state);
    ev.target.reset();
    renderAll();
  });
}

function init() {
  syncSettingsInputs();
  renderAll();
  bindEvents();
  startScheduler();
}

init();
