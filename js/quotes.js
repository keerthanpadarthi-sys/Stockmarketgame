// Fetches live quotes from Finnhub's free /quote endpoint (no server needed,
// CORS-enabled for browser calls). Falls back to manual prices per symbol
// when there's no API key, the request fails, or dataMode is "manual".

async function fetchLiveQuote(symbol, apiKey) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.c !== "number" || data.c === 0) throw new Error("No data for symbol");
  return {
    price: data.c,
    prevClose: data.pc,
    high: data.h,
    low: data.l,
    open: data.o,
    ts: Date.now(),
    source: "live",
  };
}

function manualQuote(symbol, state) {
  const price = state.manualPrices[symbol];
  if (typeof price !== "number" || price <= 0) return null;
  return {
    price,
    prevClose: price,
    high: price,
    low: price,
    open: price,
    ts: Date.now(),
    source: "manual",
  };
}

/**
 * Fetch quotes for every symbol, returning { quotes, errors }.
 * quotes: { [symbol]: quoteObject }
 * errors: { [symbol]: message }
 */
export async function fetchAllQuotes(symbols, state) {
  const quotes = {};
  const errors = {};

  const useLive = state.dataMode === "live" && state.apiKey.trim().length > 0;

  await Promise.all(
    symbols.map(async (symbol) => {
      if (useLive) {
        try {
          quotes[symbol] = await fetchLiveQuote(symbol, state.apiKey.trim());
          return;
        } catch (e) {
          errors[symbol] = `Live fetch failed (${e.message}), falling back to manual price.`;
        }
      }
      const manual = manualQuote(symbol, state);
      if (manual) {
        quotes[symbol] = manual;
      } else if (!errors[symbol]) {
        errors[symbol] = "No live data and no manual price set.";
      }
    })
  );

  return { quotes, errors };
}
