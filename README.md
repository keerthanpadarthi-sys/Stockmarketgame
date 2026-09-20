# Stock Game Advisor

A small, self-contained website that acts as a decision-support tool for a
[Stock Market Game](https://www.stockmarketgame.org/pa.html) paper-trading
portfolio. It watches real market quotes for the symbols you care about and
turns them into rule-based buy/sell/hold suggestions on a timer (every 30 or
60 minutes), while keeping a hard cap on how much of your play money it will
ever recommend putting to work.

It does **not** log into stockmarketgame.org or place trades for you — that
site is login-gated and there's no official API, so this tool never handles
your game credentials. You execute anything you decide on the game site
yourself, then tell this app what you now hold.

## How it works

- **Budget guardrail** — set your total bankroll (default `$100,000`) and a
  trading cap (default `$50,000`). The advisor will never size a recommended
  buy so that total deployed capital exceeds the cap; the rest stays in
  reserve.
- **Holdings & watchlist** — enter what you currently hold (symbol, shares,
  average cost) and the symbols you want the advisor to watch.
- **Quotes** — by default it pulls live quotes from
  [Finnhub](https://finnhub.io/register)'s free tier (sign up for a free API
  key, paste it into Settings — it's stored only in your browser's
  `localStorage`, never sent anywhere else). If you'd rather not use an API
  key, switch Settings → Data source to "Manual entry" and type in prices
  from the game site's quote page yourself.
- **Scoring** — for each symbol it blends today's % change, the trend across
  the snapshots it has collected in your browser this session, and a
  volatility penalty into a score. Existing holdings get SELL/TRIM/HOLD
  signals based on your P/L and trend; watchlist symbols get BUY/WATCH/AVOID
  signals, with buy size capped at 25% of the trading budget per symbol.
- **Timer** — runs automatically every 30 or 60 minutes (your choice), or on
  demand via "Run analysis now". Optionally fires a browser notification
  with the latest summary.
- **History** — every run's headline recommendation is logged so you can see
  what the advisor said over time.

## Running it

This is a static site — no build step, no backend.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or open `index.html` directly in a browser, or deploy the folder as-is to
GitHub Pages / Netlify / any static host.

## Disclaimer

This produces simple, rule-based, educational suggestions for a play-money
simulation game. It is not financial advice and should not be used to make
real investment decisions.
