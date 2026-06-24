# 🔦 BEACON
### Bitget Strategy Intelligence Layer — AI Hackathon Season 1

**Track:** Trading Infrastructure &nbsp;|&nbsp; **Builder:** Samuel Oduntan [@Argeneau12e](https://github.com/Argeneau12e)

---

## The Problem

Bitget launched GetAgent Playbook on June 17, 2026 — giving users access to DCA, Grid, and Trend-Following strategy templates they can subscribe to and run automatically. The infrastructure is excellent. But there is a critical missing layer:

**Nothing tells users whether NOW is the right time to start a strategy, or which Playbook type fits current market conditions.**

A user staring at GetAgent Playbook has no way to answer:
- Is the market in a DCA-favorable zone or an extreme greed zone?
- Is the funding rate signaling overcrowding in one direction?
- Would a DCA strategy started today have outperformed a signal-conditioned one over the past 90 days?

This is the gap BEACON fills.

---

## What BEACON Does

BEACON is a real-time market intelligence platform that serves as the decision layer between a trader's intuition and Bitget's GetAgent Playbook. It answers one question: **should I start a strategy now, and which one?**

### Module 1 — Live Signal Panel

Four live signals pulled from Bitget's Agent Hub REST API and processed in real time:

| Signal | Source | What it measures |
|--------|--------|-----------------|
| RSI (14-day) | Bitget Spot API `/v2/spot/market/candles` | Price momentum — below 30 is historically a strong DCA entry |
| Funding Rate | Bitget Futures API `/v2/mix/market/current-fund-rate` | Futures positioning — negative rate = bears paying longs = mild bullish lean |
| Open Interest | Bitget Futures API `/v2/mix/market/open-interest` | Capital flow — rising OI = new money entering the market |
| Fear & Greed | alternative.me (free public API) | Market sentiment 0–100 — below 25 = historically the best DCA entry zone |

These four signals are combined into a single **DCA Entry Score (0–100)** using a weighted formula that mirrors the signal logic from DCA_Claw, a prior contest-winning DCA intelligence system.

### Module 2 — AI Strategy Advisor

The DCA Entry Score and all four raw signals are sent to Groq AI (Llama 3) which returns a plain-English, three-sentence market analysis:

1. What the current signals are showing
2. Whether this is a good or poor moment to start a DCA strategy
3. Which Bitget GetAgent Playbook type fits best: DCA, Grid Trading, or Trend-Following

This directly maps signal intelligence to an actionable Playbook recommendation — the exact gap Bitget's own CEO identified when she noted that "half the complexity of using AI in trading workflows is configuring the prompt."

### Module 3 — Strategy Backtester

Users can run a 90-day historical comparison between two DCA approaches on any Bitget trading pair:

- **Plain DCA** — buys every N days regardless of market conditions (the default approach)
- **Smart DCA** — only buys when RSI < 45 AND Fear & Greed < 50 (signal-conditioned)

The backtest pulls real historical candle data from Bitget's public API and 90 days of Fear & Greed history. It returns two equity curves, total return %, number of buys, and a side-by-side Chart.js visualization. This demonstrates the measurable value of the intelligence layer over naive DCA.

---

## Architecture

```
Browser (public/index.html)
        │
        │  HTTP (localhost:3000)
        ▼
Express Server (server.js)
        │
        ├──► Bitget Agent Hub REST API
        │     ├── /api/v2/spot/market/candles       (RSI + backtest price data)
        │     ├── /api/v2/mix/market/current-fund-rate  (funding rate)
        │     └── /api/v2/mix/market/open-interest       (open interest)
        │
        ├──► alternative.me
        │     └── /fng/?limit=90    (Fear & Greed — current + 90-day history)
        │
        └──► Groq API (Llama 3 8B)
              └── /openai/v1/chat/completions  (AI market analysis + Playbook rec)
```

The Express server acts as a proxy layer, solving browser CORS restrictions and keeping the Groq API key server-side.

---

## Bitget Tools Used

- **Bitget Agent Hub REST API** — spot market candles, futures funding rate, futures open interest (all public endpoints, no authentication required)
- **GetAgent Playbook** — BEACON's output directly maps to Playbook strategy selection (DCA, Grid, Trend-Following) and is designed to guide users into Playbook configuration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Charts | Chart.js 4.4 |
| AI | Groq API (Llama 3 8B) |
| Market Data | Bitget V2 REST API (public) |
| Sentiment | alternative.me Fear & Greed API |
| Fonts | Cormorant Garamond, DM Sans, IBM Plex Mono |

---

## Quick Start

### Prerequisites
- Node.js v18 or higher
- A free [Groq API key](https://console.groq.com)

### Install

```bash
git clone https://github.com/Argeneau12e/beacon.git
cd beacon
npm install
```

### Configure

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

No Bitget API key is required. All market data endpoints used are public.

### Run

```bash
npm start
```

Open `http://localhost:3000` in your browser.

---

## How to Use

1. **Select a trading pair** from the dropdown (BTC, ETH, SOL, BNB, XRP)
2. **Read the Signal Panel** — four live cards show the current state of RSI, Funding Rate, Fear & Greed, and Open Interest with color-coded status labels
3. **Check the DCA Entry Score** — the animated gauge combines all four signals into one 0–100 number. Green (60+) = strong DCA conditions. Amber (35–60) = mixed. Red (below 35) = poor timing
4. **Read the AI Advisor** — Groq AI explains what the signals mean in plain English and tells you which Bitget GetAgent Playbook type to use
5. **Run the Backtest** — select a pair and DCA interval to see how Plain DCA vs Smart DCA (signal-conditioned) would have performed over the past 90 days on real Bitget data
6. **Open GetAgent Playbook** on Bitget and use BEACON's recommendation to configure your strategy

---

## Sample Output

**Signal Panel — Extreme Fear scenario:**
```
RSI:          24.3  →  Oversold — Strong Entry    [GREEN]
Funding Rate: -0.0124%  →  Negative — Bullish Lean  [GREEN]
Fear & Greed:  18   →  Extreme Fear — Best DCA Zone [GREEN]
Open Interest: $6.8B →  Futures Positioning (Live)
DCA Entry Score: 81 / 100  →  Strong Entry Conditions
```

**AI Advisor output:**
```
Market signals are aligned in a historically favorable DCA zone — RSI is deeply 
oversold at 24.3, Fear & Greed shows extreme fear at 18, and the negative funding 
rate indicates shorts are paying longs. This is one of the better moments to begin 
or increase a DCA position, as extreme fear readings have historically preceded 
significant recoveries. The Bitget GetAgent Playbook DCA strategy is the strongest 
fit here — it automates systematic buying into market weakness, which is exactly 
the condition these signals describe.
```

---

## Verifiable Usage Records

All sample files in `/samples/` are **real API responses auto-captured by the server** on every live request. No data was fabricated.

- `signals.json` — auto-written by `/api/signals` on every page load
- `analysis.json` — auto-written by `/api/analyze` on every AI call
- `backtest.json` — auto-written by `/api/backtest` on every backtest run

To reproduce: clone the repo, add `.env` with your Groq key, run `npm start`, open `http://localhost:3000`, and the files write themselves.

---

## File Structure

```
beacon/
├── server.js           ← Express backend — API proxy, RSI engine, backtest logic
├── public/
│   └── index.html      ← Complete frontend — signal panel, gauge, AI advisor, chart
├── samples/
│   ├── signals.json    ← Sample /api/signals response
│   └── backtest.json   ← Sample /api/backtest response
├── .env.example        ← Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Why BEACON Wins the Infra Track

The Infra track asks: *what specific pain point in agent development or trading workflows did you identify?*

The pain point is precise: **Bitget has world-class strategy execution infrastructure but no intelligence layer that tells users when to use it.** GetAgent Playbook launched three days before this submission. Users can browse strategy templates but have no external, data-driven signal telling them which template fits today's market and whether today is even a good day to start.

BEACON provides that layer. It is not a trading agent — it places no orders, manages no wallet, runs no autonomous decisions. It is pure infrastructure: a signal aggregation and intelligence platform that makes Bitget's existing tools more accessible and more effective for the 125 million users who need guidance, not just execution.

---

## Built By

**Samuel Oduntan** &nbsp;|&nbsp; Lagos, Nigeria  
GitHub: [@Argeneau12e](https://github.com/Argeneau12e)  
X: [@Little_Sam_1428](https://x.com/Little_Sam_1428)  
Email: oduntansamuel2801@gmail.com

*BEACON inherits signal architecture from DCA_Claw v3.2, a prior Binance contest winner, adapted for Bitget's ecosystem.*

---
# BEACON

**Bitget Strategy Intelligence Layer**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Bitget API](https://img.shields.io/badge/Bitget-Agent%20Hub%20API-00C6FF?style=flat-square)
![Groq AI](https://img.shields.io/badge/Groq-Llama%203.1-FF6B35?style=flat-square)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Hackathon](https://img.shields.io/badge/Bitget%20AI%20Hackathon-Season%201-f59e0b?style=flat-square)
![Track](https://img.shields.io/badge/Track-Trading%20Infrastructure-10b981?style=flat-square)

> A real-time market intelligence platform that serves as the missing decision layer between a trader's intuition and Bitget's GetAgent Playbook — combining live signal analysis, market regime classification, AI-powered recommendations, 90-day accuracy verification, and structured agent output into a single cohesive system.

**Live Demo:** [https://beacon-rosy-nine.vercel.app/](https://beacon-rosy-nine.vercel.app/)

**Track:** Trading Infrastructure
**Builder:** Samuel Oduntan — [@Argeneau12e](https://github.com/Argeneau12e)

---

## The Problem

Bitget serves 125 million users. Most are non-expert retail traders for whom Dollar Cost Averaging is the optimal strategy. Bitget has excellent infrastructure — Auto-Invest, Recurring Buy, and DCA-type strategies in the newly launched GetAgent Playbook. But there is a critical missing layer:

**Nothing tells users whether current market conditions favor starting a strategy, at what interval, with what allocation, or which Playbook type fits today's market.**

Users stare at GetAgent Playbook with no data-backed guidance. Bitget's own CEO confirmed it: half the complexity of using AI in trading workflows is configuring the prompt. BEACON provides the intelligence layer that closes this gap — from live signal aggregation through to a ready-to-deploy Playbook configuration.

---

## Platform Overview

BEACON is a 9-endpoint Express server with a single-file frontend. Every page load fetches live data from Bitget's Agent Hub REST API and processes it through a layered intelligence stack: signal aggregation, regime classification, AI analysis, interval optimization, backtest verification, and structured agent output.

### Module 1 — Live Market Intelligence Panel

Five signals fetched in parallel from Bitget's Agent Hub REST API on every load:

| Signal | Source | What it measures |
|---|---|---|
| RSI (14-day) | Bitget Spot API `/v2/spot/market/candles` | Price momentum. Below 30 = oversold entry zone. Above 70 = overbought. |
| Funding Rate | Bitget Futures API `/v2/mix/market/current-fund-rate` | Futures positioning. Negative = bears paying longs = contrarian bullish lean. |
| Open Interest | Bitget Futures API `/v2/mix/market/open-interest` | Capital flow. Rising = new money entering the market. |
| Fear & Greed | alternative.me (free public API) | Market sentiment 0–100. Below 25 historically precedes significant recoveries. |
| Daily Volatility | Calculated from Bitget candlestick data | Std-dev of daily returns. 1–3% = ideal DCA range. Above 5% = elevated risk. |

Each signal card is color-coded by implication: green for bullish conditions, amber for neutral, red for bearish. All five combine into the DCA Entry Score.

### Module 2 — Market Regime Classifier

A six-state market regime engine that classifies conditions into named states with specific Playbook implications:

| Regime | Conditions | Playbook |
|---|---|---|
| CAPITULATION | F&G below 20 AND RSI below 30 | DCA — Full allocation immediately |
| ACCUMULATION | F&G below 35 AND RSI below 45 AND negative funding | DCA — Standard allocation |
| CONSOLIDATION | Low volatility AND neutral funding AND neutral sentiment | Grid Trading |
| EXPANSION | RSI above 55 AND F&G above 55 AND positive funding | DCA — Reduced allocation |
| EUPHORIA | High volatility AND RSI above 60 AND crowded longs | Trend-Following — Do not DCA |
| DISTRIBUTION | F&G above 75 AND RSI above 70 | Pause DCA entirely |

The regime banner at the top of the dashboard shows the current state with a color-coded glowing indicator and a plain-English description of what it means for the user's strategy.

### Module 3 — 30-Day Regime History Calendar

A visual strip of 30 colored squares below the regime banner, one per day. Green = bullish regime. Amber = neutral. Red = bearish. Hovering any square shows the date, regime name, RSI, and Fear & Greed reading for that day. Fetched from Bitget historical candle data combined with Fear & Greed history.

### Module 4 — AI Strategy Advisor

The five live signals plus the regime classification are sent to Groq AI (Llama 3.1 8B) which returns three sentences: what the current market regime means, whether now is a strong or poor DCA entry and why, and which Bitget GetAgent Playbook type to configure. The response is structurally constrained to always terminate with a concrete Playbook action. A fallback template activates if Groq is unavailable so the dashboard never breaks.

### Module 5 — DCA Interval Optimizer

Computes the mathematically optimal DCA interval from current volatility and the DCA Entry Score:

- Above 4% daily volatility: every 3 days (frequent small buys average extreme dips)
- 2.5–4% volatility: every 5 days
- Score above 65: every 7 days (standard strong-entry window)
- Score 40–65: every 10 days (reduced exposure in mixed conditions)
- Below threshold: every 14 days (minimal commitment only)

### Module 6 — Playbook Config Generator

Generates a complete, copy-pasteable configuration block for Bitget GetAgent Playbook on every page load. Fields: Strategy, Pair, Amount per Cycle, Frequency, Entry Condition, Pause Condition, Market Regime, Signal Confidence, and Optimizer Reason. This is the direct product integration: BEACON's output maps exactly to the fields a user would configure in GetAgent Playbook.

### Module 7 — Strategy Backtester

Runs a 90-day historical simulation on any Bitget trading pair comparing two DCA approaches:

**Plain DCA:** Buys every N days regardless of market conditions. The most common approach — set and forget.

**Smart DCA:** Two entry conditions:
1. Capitulation override — RSI below 28 OR Fear & Greed below 20. Buy regardless of trend direction. These are historically the highest-conviction entry points.
2. Accumulation Dip — Fear & Greed below 50 AND RSI below 40 AND price above 95% of the 20-day moving average. This prevents buying into sustained downtrends while still capturing genuine dip entries.

Output: Return %, Sharpe Ratio, and Max Drawdown for both strategies side by side. If Smart DCA underperforms in the selected window, a context note explains why (typically sustained downtrends where even discounted entries keep falling) and clarifies what market conditions Smart DCA is optimised for.

Data source: Bitget public historical candle API combined with 90 days of Fear & Greed history.

### Module 8 — Multi-Pair Signal Radar

Scans eight Bitget trading pairs simultaneously using parallel API calls — BTC, ETH, SOL, BNB, XRP, DOGE, AVAX, and LINK. Fear & Greed is fetched once (it is market-wide) and shared across all pairs. Each pair receives its own candles, funding rate, and open interest call. Results are sorted by DCA Entry Score descending and displayed as a ranked table with animated score bars, regime badges, RSI, funding rate, and recommendations. The top-ranked pair receives a BEST ENTRY indicator.

### Module 9 — Signal Autopsy (90-Day Accuracy Verification)

The feature that distinguishes BEACON from every other signal dashboard: a retroactive accuracy audit using real Bitget historical data.

For each of the past 90 days on any selected pair, BEACON calculates what regime and signal would have been issued on that day using real historical RSI and Fear & Greed data. It then checks 7 and 14 days forward to determine whether the market moved as the signal predicted.

Output per regime:
- Number of days that regime appeared in the 90-day window
- 7-day hit rate: percentage of bullish signals followed by a price increase within 7 days
- 14-day hit rate: same for 14-day forward window
- Average 7-day return following each signal type
- Average 14-day return following each signal type

A price chart overlays the 90-day price history with colored signal dots. Hover any dot to see the date, regime, RSI, Fear & Greed, and exact 7-day and 14-day return that followed that signal.

Methodology note: historical funding rate data is unavailable from Bitget's public API. The Autopsy uses RSI and Fear & Greed only for historical classification. Live signals additionally incorporate funding rate and open interest for greater precision.

### Module 10 — DCA Budget Allocator

User enters a monthly DCA budget in USDT. BEACON runs the Radar scan internally, filters pairs with scores above 35 and non-bearish regimes, then allocates the budget proportionally by signal score. Higher-scored pairs receive larger allocations. Bearish-regime pairs receive zero and are listed separately. Output includes the recommended interval for each allocated pair and a direct Playbook configuration note.

### Module 11 — Agent Signal Feed

A structured JSON endpoint that any Bitget AI agent or MCP-connected tool can consume directly without parsing raw signal data. Returns a ready action (`DCA_BUY`, `DCA_HOLD`, or `DCA_PAUSE`), confidence level, regime classification, full Playbook configuration, and a human-readable reasoning string. Valid for 4 hours from generation time. This endpoint makes BEACON not just a dashboard but a machine-readable signal API for the Bitget ecosystem.

Example output:
```json
{
  "schema": "beacon-agent-feed-v1",
  "symbol": "BTCUSDT",
  "action": "DCA_BUY",
  "confidence": "HIGH",
  "regime": "ACCUMULATION",
  "playbook": "DCA",
  "signals": {
    "rsi": 36.8,
    "fear_greed": 28,
    "dca_entry_score": 71
  },
  "reasoning": "Fear dominates sentiment, RSI is weak, futures traders are net short. High volatility — frequent small buys average extreme dips."
}
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/signals?symbol=BTCUSDT` | All 5 live signals + regime + score + Playbook config. Auto-logs to `samples/signals.json`. |
| POST | `/api/analyze` | Sends signals to Groq AI, returns 3-sentence market analysis and Playbook recommendation. Auto-logs to `samples/analysis.json`. |
| POST | `/api/backtest` | Runs Plain DCA vs Smart DCA simulation. Returns 6 metrics + dual equity curves. Auto-logs to `samples/backtest.json`. |
| GET | `/api/radar` | Scans 8 pairs simultaneously, returns ranked table. Auto-logs to `samples/radar.json`. |
| GET | `/api/autopsy?symbol=BTCUSDT` | 90-day signal accuracy verification. Auto-logs to `samples/autopsy.json`. |
| GET | `/api/agent-feed?symbol=BTCUSDT` | MCP-compatible structured signal payload. Auto-logs to `samples/agent-feed.json`. |
| GET | `/api/regime-history?symbol=BTCUSDT` | 30-day regime classification history for calendar display. |
| GET | `/api/ticker?symbol=BTCUSDT` | Live price and 24h change for header display. |
| GET | `/api/pairs` | Top 25 USDT pairs by 24h volume from Bitget. Used to populate dynamic pair dropdowns. |
| GET | `/api/candles` | Proxied Bitget candlestick data (solves browser CORS). |
| GET | `/api/fear-greed` | Proxied Fear & Greed index (90-day history). |

---

## Architecture

```
Browser (public/index.html)
        |
        | HTTP requests
        v
Express Server (server.js) — Node.js 18+
        |
        |-- Bitget Agent Hub REST API (public endpoints, no auth)
        |     |-- /api/v2/spot/market/candles      (RSI, volatility, backtest data)
        |     |-- /api/v2/spot/market/tickers       (live price, 24h change, pair list)
        |     |-- /api/v2/mix/market/current-fund-rate   (funding rate)
        |     `-- /api/v2/mix/market/open-interest        (open interest)
        |
        |-- alternative.me (free public API)
        |     `-- /fng/?limit=90    (Fear & Greed — current + 90-day history)
        |
        `-- Groq API
              `-- /openai/v1/chat/completions  (Llama 3.1 8B — AI market analysis)
```

The Express server acts as a CORS proxy, keeping the Groq API key server-side, and provides all intelligence computation (RSI, volatility, regime classification, DCA scoring, backtesting) before returning clean payloads to the frontend.

---

## Bitget Tools Used

- **Bitget Agent Hub REST API** — spot market candles, spot tickers, futures funding rate, futures open interest (all public endpoints, no authentication required for market data)
- **GetAgent Playbook** — BEACON's Playbook Config Generator outputs configurations that map directly to GetAgent Playbook fields. The Agent Signal Feed provides a machine-readable action payload for Bitget AI agents integrating with Playbook.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | Node.js 18+ + Express | API server, signal computation, CORS proxy |
| AI | Groq API (Llama 3.1 8B) | Market analysis, Playbook recommendations |
| Market Data | Bitget V2 REST API | Candles, tickers, funding rate, open interest |
| Sentiment | alternative.me Fear & Greed API | Market sentiment history |
| Charts | Chart.js 4.4 | Backtest equity curves, autopsy signal overlay |
| Frontend | Vanilla HTML / CSS / JS | Single-file dashboard, no build step |
| Deployment | Vercel (serverless) | Zero-config deployment, compatible out of the box |
| Typography | Cormorant Garamond, DM Sans, IBM Plex Mono | Display, body, data |

---

## Deployment

### Vercel (Live Demo)

BEACON is deployed and running at:

**[https://beacon-rosy-nine.vercel.app/](https://beacon-rosy-nine.vercel.app/)**

Vercel compatibility is out of the box. The Express server runs as a serverless function. To deploy your own instance:

1. Fork this repository
2. Connect to Vercel via [vercel.com/new](https://vercel.com/new)
3. Add `GROQ_API_KEY` as an environment variable in Vercel project settings
4. Deploy — no configuration files needed

No Bitget API key is required for deployment. All market data endpoints are public.

### Local Development

Prerequisites: Node.js v18 or higher, a free [Groq API key](https://console.groq.com)

```bash
git clone https://github.com/Argeneau12e/beacon.git
cd beacon
npm install
```

Create `.env` in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

```bash
npm start
```

Open `http://localhost:3000`. The terminal confirms all connections on startup.

---

## How to Use

1. **Select a pair** from the dynamic dropdown — 25+ pairs loaded live from Bitget by 24h volume
2. **Read the Regime Banner** — named market state with color-coded indicator and plain-English description
3. **Check the 30-day calendar** — hover any square to see what regime each day was classified as
4. **Read the Signal Panel** — five cards with color-coded status labels
5. **Check the DCA Entry Score** — animated gauge from 0–100 combining all five signals
6. **Read the AI Advisor** — three sentences from Groq explaining current conditions and which Playbook to use
7. **Copy the Playbook Config** — ready-to-use configuration for GetAgent Playbook
8. **Run the Backtester** — select pair and interval to compare Plain DCA vs Smart DCA on 90 days of real Bitget data
9. **Run the Radar** — scan eight pairs simultaneously and find the best current opportunity
10. **Run the Signal Autopsy** — verify BEACON's historical signal accuracy on any pair
11. **Use the Budget Allocator** — enter monthly budget and receive a data-backed allocation across pairs
12. **Fetch the Agent Feed** — view the MCP-compatible structured payload for AI agent integration

---

## Verifiable Usage Records

All sample files in `/samples/` are real API responses auto-captured by the server on every live request. No data was fabricated. The server writes to these files automatically using `fs.writeFileSync` — no manual steps.

| File | Captured from | Trigger |
|---|---|---|
| `signals.json` | `/api/signals` | Every page load |
| `analysis.json` | `/api/analyze` | Every AI analysis call |
| `backtest.json` | `/api/backtest` | Every backtest run |
| `radar.json` | `/api/radar` | Every radar scan |
| `autopsy.json` | `/api/autopsy` | Every autopsy run |
| `agent-feed.json` | `/api/agent-feed` | Every agent feed fetch |

To reproduce any sample: clone the repo, add `.env` with a Groq key, run `npm start`, and trigger the corresponding action in the browser.

---

## File Structure

```
beacon/
|-- server.js                  Express backend — all API routes, signal computation,
|                              regime classification, backtest engine, auto-logger
|-- public/
|   `-- index.html             Complete frontend — all CSS and JS inline, no build step
|-- samples/
|   |-- signals.json           Auto-captured: live signal response
|   |-- analysis.json          Auto-captured: Groq AI analysis output
|   |-- backtest.json          Auto-captured: backtest simulation result
|   |-- radar.json             Auto-captured: multi-pair radar scan
|   |-- autopsy.json           Auto-captured: 90-day accuracy verification
|   `-- agent-feed.json        Auto-captured: MCP agent feed payload
|-- .env.example               Environment variable template
|-- .gitignore
|-- package.json
`-- README.md
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Free API key from [console.groq.com](https://console.groq.com) |
| `PORT` | No | Server port. Defaults to 3000. |

No Bitget API key is required. All Bitget endpoints used are public market data endpoints that do not require authentication.

---

## Built By

Samuel Oduntan — Lagos, Nigeria

GitHub: [@Argeneau12e](https://github.com/Argeneau12e)
X: [@Little_Sam_1428](https://x.com/Little_Sam_1428)
Email: oduntansamuel2801@gmail.com

Signal architecture adapted from DCA_Claw v3, a prior Binance contest winner, rewritten for Bitget's ecosystem and extended with regime classification, autopsy verification, budget allocation, and MCP-compatible agent output.

---

*Bitget AI Hackathon Season 1 — Trading Infrastructure Track — June 2026*
*Bitget AI Hackathon Season 1 — June 2026*