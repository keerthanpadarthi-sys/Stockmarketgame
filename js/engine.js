// Rule-based scoring engine. No prediction, just momentum/trend heuristics
// applied to whatever price data the app has collected.

const HISTORY_POINTS_PER_SYMBOL = 40;
const MAX_POSITION_SHARE = 0.25; // never suggest putting more than 25% of the trading cap into one symbol

export function recordPriceHistory(state, symbol, quote) {
  const history = state.priceHistory[symbol] || [];
  history.push({ ts: quote.ts, price: quote.price });
  if (history.length > HISTORY_POINTS_PER_SYMBOL) history.shift();
  state.priceHistory[symbol] = history;
}

function sessionTrendPct(state, symbol) {
  const history = state.priceHistory[symbol] || [];
  if (history.length < 2) return 0;
  const first = history[0].price;
  const last = history[history.length - 1].price;
  if (!first) return 0;
  return ((last - first) / first) * 100;
}

export function deployedCapital(state) {
  return state.holdings.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
}

export function remainingBudget(state) {
  return Math.max(0, state.tradingCap - deployedCapital(state));
}

function scoreQuote(state, symbol, quote) {
  const dayChangePct = quote.prevClose ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : 0;
  const trendPct = sessionTrendPct(state, symbol);
  const rangePct = quote.low ? ((quote.high - quote.low) / quote.low) * 100 : 0;
  const score = dayChangePct * 0.6 + trendPct * 0.4 - rangePct * 0.15;
  const overbought = dayChangePct > 8 || trendPct > 12;
  const oversold = dayChangePct < -8 || trendPct < -12;
  return { dayChangePct, trendPct, rangePct, score, overbought, oversold };
}

function suggestedBuy(state, symbol, quote) {
  const budget = remainingBudget(state);
  if (budget < quote.price) return null;
  const capForOneSymbol = state.tradingCap * MAX_POSITION_SHARE;
  const dollars = Math.min(budget, capForOneSymbol);
  const shares = Math.floor(dollars / quote.price);
  if (shares <= 0) return null;
  return { shares, dollars: shares * quote.price };
}

/**
 * Builds a ranked set of recommendations from current quotes.
 * Returns { summary, items: [{type, symbol, shares, dollars, reason, score}] }
 */
export function buildRecommendations(state, quotes) {
  const items = [];
  const holdingsBySymbol = new Map(state.holdings.map((h) => [h.symbol, h]));

  for (const [symbol, quote] of Object.entries(quotes)) {
    const metrics = scoreQuote(state, symbol, quote);
    const holding = holdingsBySymbol.get(symbol);

    if (holding) {
      const plPct = holding.avgCost ? ((quote.price - holding.avgCost) / holding.avgCost) * 100 : 0;
      if (plPct <= -8 || metrics.trendPct <= -10) {
        items.push({
          type: "SELL",
          symbol,
          shares: holding.shares,
          dollars: holding.shares * quote.price,
          score: metrics.score,
          reason: `Down ${Math.abs(plPct).toFixed(1)}% from your average cost and trending lower (${metrics.trendPct.toFixed(1)}% this session). Cutting the loss frees up budget.`,
        });
      } else if (plPct >= 15 || metrics.trendPct >= 18) {
        items.push({
          type: "TRIM",
          symbol,
          shares: Math.max(1, Math.floor(holding.shares / 2)),
          dollars: Math.max(1, Math.floor(holding.shares / 2)) * quote.price,
          score: metrics.score,
          reason: `Up ${plPct.toFixed(1)}% from your average cost. Consider locking in some of the gain and keeping the rest to ride further upside.`,
        });
      } else {
        items.push({
          type: "HOLD",
          symbol,
          shares: holding.shares,
          dollars: holding.shares * quote.price,
          score: metrics.score,
          reason: `P/L ${plPct >= 0 ? "+" : ""}${plPct.toFixed(1)}%, no strong signal either way yet.`,
        });
      }
    } else {
      if (metrics.overbought) {
        items.push({
          type: "AVOID",
          symbol,
          score: metrics.score,
          reason: `Up ${metrics.dayChangePct.toFixed(1)}% today / ${metrics.trendPct.toFixed(1)}% this session — likely overbought, wait for a pullback.`,
        });
      } else if (metrics.score > 1.5) {
        const buy = suggestedBuy(state, symbol, quote);
        if (buy) {
          items.push({
            type: "BUY",
            symbol,
            shares: buy.shares,
            dollars: buy.dollars,
            score: metrics.score,
            reason: `Momentum +${metrics.dayChangePct.toFixed(1)}% today, session trend +${metrics.trendPct.toFixed(1)}%. Sized to stay inside your trading budget.`,
          });
        } else {
          items.push({
            type: "WATCH",
            symbol,
            score: metrics.score,
            reason: "Positive momentum, but no trading budget left to size a buy right now.",
          });
        }
      } else if (metrics.score < -1.5) {
        items.push({
          type: "AVOID",
          symbol,
          score: metrics.score,
          reason: `Negative momentum (${metrics.dayChangePct.toFixed(1)}% today, ${metrics.trendPct.toFixed(1)}% this session).`,
        });
      } else {
        items.push({
          type: "WATCH",
          symbol,
          score: metrics.score,
          reason: "No clear edge yet, keep watching.",
        });
      }
    }
  }

  const priority = { SELL: 0, TRIM: 1, BUY: 2, WATCH: 3, HOLD: 4, AVOID: 5 };
  items.sort((a, b) => (priority[a.type] - priority[b.type]) || b.score - a.score);

  const actionable = items.filter((i) => i.type === "BUY" || i.type === "SELL" || i.type === "TRIM");
  let summary;
  if (actionable.length === 0) {
    summary = "Nothing actionable right now — holding steady and keep watching the list.";
  } else {
    summary = actionable
      .slice(0, 3)
      .map((i) => `${i.type} ${i.shares ? i.shares + " sh " : ""}${i.symbol}`)
      .join("  •  ");
  }

  return { summary, items };
}
