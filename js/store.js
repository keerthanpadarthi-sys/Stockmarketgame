const STORAGE_KEY = "stockGameAdvisor.state.v1";

function defaultState() {
  return {
    bankroll: 100000,
    tradingCap: 50000,
    holdings: [],
    watchlist: ["AAPL", "MSFT", "NVDA", "AMZN"],
    apiKey: "",
    dataMode: "live",
    refreshMinutes: 30,
    notificationsEnabled: false,
    manualPrices: {},
    priceHistory: {},
    history: [],
    lastRun: null,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch (e) {
    console.warn("Failed to load saved state, starting fresh.", e);
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state.", e);
  }
}

export function allSymbols(state) {
  const set = new Set(state.watchlist);
  state.holdings.forEach((h) => set.add(h.symbol));
  return Array.from(set);
}
