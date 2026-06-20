require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BITGET = 'https://api.bitget.com';
const GROQ   = 'https://api.groq.com/openai/v1/chat/completions';

// ─────────────────────────────────────────────────────────────────
//  HELPER: safe HTTP GET with timeout
// ─────────────────────────────────────────────────────────────────
async function get(url, params = {}) {
  try {
    const res = await axios.get(url, { params, timeout: 8000 });
    return res.data;
  } catch (e) {
    console.error(`[BEACON] GET failed: ${url}`, e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: RSI calculator (same logic as DCA_Claw confidence.js)
// ─────────────────────────────────────────────────────────────────
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: DCA Entry Score (0–100)
//  Combines all 4 signals into one readable number for the user
// ─────────────────────────────────────────────────────────────────
function calcDCAScore({ rsi, fundingRate, oiChange, fearGreed }) {
  // RSI component (25 pts): below 30 = max score, above 70 = 0
  const rsiScore = rsi <= 30 ? 25
    : rsi >= 70 ? 0
    : ((70 - rsi) / 40) * 25;

  // Funding rate component (25 pts): negative rate = bullish
  const fr = parseFloat(fundingRate ?? 0);
  const frScore = fr < -0.0001 ? 25
    : fr > 0.0005 ? 0
    : ((0.0005 - fr) / 0.0006) * 25;

  // Open interest component (25 pts): positive OI change = bullish
  const oi = parseFloat(oiChange ?? 0);
  const oiScore = oi > 5 ? 25
    : oi < -10 ? 0
    : ((oi + 10) / 15) * 25;

  // Fear & Greed component (25 pts): extreme fear = best DCA entry
  const fg = parseInt(fearGreed ?? 50);
  const fgScore = fg <= 25 ? 25
    : fg >= 75 ? 0
    : ((75 - fg) / 50) * 25;

  return Math.min(100, Math.round(rsiScore + frScore + oiScore + fgScore));
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: text fallback if Groq is down
// ─────────────────────────────────────────────────────────────────
function fallbackAnalysis(score) {
  if (score >= 70) return 'Multiple signals are aligned in the bullish direction — funding rate is low, sentiment shows fear, and price momentum is weakening in a way that historically precedes a bounce. This is a strong environment to begin or increase a DCA strategy. The Bitget GetAgent Playbook DCA strategy is the best fit here, as it automates systematic buying into market weakness.';
  if (score >= 45) return 'Market signals are mixed — some indicators favor buying while others suggest caution. Conditions are neither ideal nor poor for DCA. A conservative DCA with reduced position sizes is reasonable. The Bitget GetAgent Playbook DCA or Grid strategy would work depending on your risk preference.';
  return 'Signals are currently unfavorable for aggressive DCA — sentiment is elevated and open interest suggests crowded positioning. Consider reducing your DCA amount or pausing until conditions improve. If you must be active, a Trend-Following Playbook on Bitget is the safer choice over DCA right now.';
}

// ─────────────────────────────────────────────────────────────────
//  ROUTE 1 — /api/candles
//  Fetches OHLCV candle data from Bitget spot market
//  Used for: RSI calculation, backtest price series
// ─────────────────────────────────────────────────────────────────
app.get('/api/candles', async (req, res) => {
  const { symbol = 'BTCUSDT', granularity = '1D', limit = '90' } = req.query;
  const data = await get(`${BITGET}/api/v2/spot/market/candles`, {
    symbol, granularity, limit,
  });
  if (!data) return res.status(503).json({ error: 'Bitget candles unavailable' });
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 2 — /api/funding-rate
//  Fetches the current perpetual futures funding rate from Bitget
//  A negative rate means shorts are paying longs = mild bullish lean
//  A very positive rate means too many longs = crowded = risk
// ─────────────────────────────────────────────────────────────────
app.get('/api/funding-rate', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  const data = await get(`${BITGET}/api/v2/mix/market/current-fund-rate`, {
    symbol, productType: 'USDT-FUTURES',
  });
  if (!data) return res.status(503).json({ error: 'Funding rate unavailable' });
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 3 — /api/open-interest
//  Fetches total open interest for the futures market
//  Rising OI + price = healthy momentum (good for DCA)
//  Falling OI = capital exiting (caution)
// ─────────────────────────────────────────────────────────────────
app.get('/api/open-interest', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  const data = await get(`${BITGET}/api/v2/mix/market/open-interest`, {
    symbol, productType: 'USDT-FUTURES',
  });
  if (!data) return res.status(503).json({ error: 'Open interest unavailable' });
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 4 — /api/fear-greed
//  Fetches 90 days of the Crypto Fear & Greed Index
//  Below 25 = Extreme Fear = historically the single best DCA zone
//  Above 75 = Extreme Greed = historically worst DCA entry
// ─────────────────────────────────────────────────────────────────
app.get('/api/fear-greed', async (req, res) => {
  const data = await get('https://api.alternative.me/fng/', {
    limit: 90, format: 'json',
  });
  if (!data) return res.status(503).json({ error: 'Fear & Greed unavailable' });
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 5 — POST /api/signals
//  Aggregates all 4 live signals and returns the DCA Entry Score
//  This is the master endpoint the frontend calls on load
// ─────────────────────────────────────────────────────────────────
app.get('/api/signals', async (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';

  // Fetch all data in parallel (faster than sequential)
  const [candleData, fundingData, oiData, fgData] = await Promise.all([
    get(`${BITGET}/api/v2/spot/market/candles`, { symbol, granularity: '1D', limit: '30' }),
    get(`${BITGET}/api/v2/mix/market/current-fund-rate`, { symbol, productType: 'USDT-FUTURES' }),
    get(`${BITGET}/api/v2/mix/market/open-interest`, { symbol, productType: 'USDT-FUTURES' }),
    get('https://api.alternative.me/fng/', { limit: 2, format: 'json' }),
  ]);

  // — Parse candles → RSI
  let rsi = 50;
  if (candleData?.data?.length) {
    const closes = candleData.data.map(c => parseFloat(c[4]));
    rsi = calculateRSI(closes, 14);
  }

  // — Parse funding rate
  let fundingRate = null;
  if (fundingData?.data?.length) {
    fundingRate = parseFloat(fundingData.data[0].fundingRate);
  }

  // — Parse open interest (compute 24h change from two readings)
  let oiChange = null;
  if (oiData?.data) {
    const oi = parseFloat(oiData.data.size || oiData.data.openInterestList?.[0]?.size || 0);
    // We store it raw; the frontend will compare over time
    oiChange = oi;
  }

  // — Parse Fear & Greed (today and yesterday)
  let fearGreed = 50;
  let fearGreedLabel = 'Neutral';
  if (fgData?.data?.length) {
    fearGreed     = parseInt(fgData.data[0].value);
    fearGreedLabel = fgData.data[0].value_classification;
  }

  // — Compute DCA Entry Score
  const dcaScore = calcDCAScore({ rsi, fundingRate, oiChange: 0, fearGreed });

  res.json({
    symbol,
    rsi,
    fundingRate,
    oiChange,
    fearGreed,
    fearGreedLabel,
    dcaScore,
    timestamp: Date.now(),
  });
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 6 — POST /api/analyze
//  Sends live signal data to Groq AI and returns a plain-English
//  market analysis + Bitget Playbook recommendation
// ─────────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { rsi, fundingRate, oiChange, fearGreed, dcaScore, symbol = 'BTCUSDT' } = req.body;

  if (!process.env.GROQ_API_KEY) {
    return res.json({ analysis: fallbackAnalysis(dcaScore) });
  }

  const frPct = fundingRate !== null && fundingRate !== undefined
    ? (parseFloat(fundingRate) * 100).toFixed(4) + '%'
    : 'unavailable';

  const prompt = `You are a market intelligence layer for Bitget's GetAgent Playbook. Analyze these live signals for ${symbol}:

RSI (14-day): ${rsi?.toFixed(1)} — below 30 = oversold = strong DCA entry; above 70 = overbought = bad entry
Funding Rate: ${frPct} — negative = shorts paying longs = bullish lean; strongly positive = crowded longs = dangerous
Fear & Greed Index: ${fearGreed}/100 — below 25 = Extreme Fear = historically the best DCA entry zone; above 75 = Extreme Greed = avoid
DCA Entry Score: ${dcaScore}/100 (BEACON's combined signal score)

Respond in exactly 3 sentences. Sentence 1: what the market is currently signaling. Sentence 2: whether right now is a good or bad moment to start or add to a DCA position and why. Sentence 3: which Bitget GetAgent Playbook strategy is the best fit — DCA, Grid Trading, or Trend-Following — and one specific reason why.`;

  try {
    const response = await axios.post(GROQ, {
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 280,
      temperature: 0.35,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
    });

    res.json({ analysis: response.data.choices[0].message.content });
  } catch (e) {
    console.error('[BEACON] Groq error:', e.message);
    res.json({ analysis: fallbackAnalysis(dcaScore) });
  }
});

// ─────────────────────────────────────────────────────────────────
//  ROUTE 7 — POST /api/backtest
//  Runs Plain DCA vs Smart DCA on Bitget historical candle data
//  Plain DCA: buys every N days regardless of conditions
//  Smart DCA: only buys when RSI < 45 AND Fear & Greed < 50
//  Returns two equity curves for side-by-side chart comparison
// ─────────────────────────────────────────────────────────────────
app.post('/api/backtest', async (req, res) => {
  const { candles, fearGreedHistory, amount = 100, interval = 7 } = req.body;

  if (!candles || candles.length < 15) {
    return res.status(400).json({ error: 'Need at least 15 candles for backtest' });
  }

  // candles from Bitget: [timestamp, open, high, low, close, volume, ...]
  const closes     = candles.map(c => parseFloat(c[4]));
  const timestamps = candles.map(c => parseInt(c[0]));

  // Precompute RSI at every point
  const rsiSeries = closes.map((_, i) => calculateRSI(closes.slice(0, i + 1), 14));

  // Align F&G history (API returns newest first → reverse for oldest-first)
  const fgAligned = fearGreedHistory ? [...fearGreedHistory].reverse() : [];

  const plain = { cash: 1000, units: 0, values: [], buys: 0 };
  const smart = { cash: 1000, units: 0, values: [], buys: 0 };

  closes.forEach((price, i) => {
    const fg  = fgAligned[i]?.value ? parseInt(fgAligned[i].value) : 50;
    const rsi = rsiSeries[i] || 50;

    // Plain DCA: buy every `interval` candles
    if (i > 0 && i % interval === 0 && plain.cash >= amount) {
      plain.units += amount / price;
      plain.cash  -= amount;
      plain.buys  += 1;
    }

    // Smart DCA: only buy when signals are favorable
    if (fg < 50 && rsi < 45 && smart.cash >= amount) {
      smart.units += amount / price;
      smart.cash  -= amount;
      smart.buys  += 1;
    }

    plain.values.push({ t: timestamps[i], v: parseFloat((plain.cash + plain.units * price).toFixed(2)) });
    smart.values.push({ t: timestamps[i], v: parseFloat((smart.cash + smart.units * price).toFixed(2)) });
  });

  const finalPrice = closes[closes.length - 1];

  const plainFinal = plain.cash + plain.units * finalPrice;
  const smartFinal = smart.cash + smart.units * finalPrice;

  res.json({
    plain: {
      values:     plain.values,
      finalValue: parseFloat(plainFinal.toFixed(2)),
      totalBuys:  plain.buys,
      returnPct:  parseFloat(((plainFinal - 1000) / 1000 * 100).toFixed(2)),
    },
    smart: {
      values:     smart.values,
      finalValue: parseFloat(smartFinal.toFixed(2)),
      totalBuys:  smart.buys,
      returnPct:  parseFloat(((smartFinal - 1000) / 1000 * 100).toFixed(2)),
    },
    meta: {
      days:       closes.length,
      startPrice: closes[0],
      endPrice:   finalPrice,
      priceChange: parseFloat(((finalPrice - closes[0]) / closes[0] * 100).toFixed(2)),
    },
  });
});

// ─────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔦 BEACON is live → http://localhost:${PORT}`);
  console.log(`   Bitget API  : connected (public endpoints, no key needed)`);
  console.log(`   Groq AI     : ${process.env.GROQ_API_KEY ? 'connected' : 'NOT SET — add GROQ_API_KEY to .env'}`);
  console.log(`   Serving UI  : /public\n`);
});