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

*Bitget AI Hackathon Season 1 — June 2026*