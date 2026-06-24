require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const SAMPLES_DIR = path.join(__dirname, 'samples');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BITGET = 'https://api.bitget.com';
const GROQ   = 'https://api.groq.com/openai/v1/chat/completions';

if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });

// ── AUTO-LOGGER ───────────────────────────────────────────────────────────────
function saveToSamples(filename, data) {
  try {
    const payload = {
      _meta: {
        captured:    new Date().toISOString(),
        source:      'BEACON live API — auto-logged by server.js',
        description: `Real response captured from ${filename.replace('.json', '')} endpoint`,
      },
      ...data,
    };
    fs.writeFileSync(path.join(SAMPLES_DIR, filename), JSON.stringify(payload, null, 2));
    console.log(`[BEACON] Auto-saved → samples/${filename}`);
  } catch (e) {
    console.error(`[BEACON] Sample save failed: ${e.message}`);
  }
}

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
async function get(url, params = {}) {
  try {
    const res = await axios.get(url, { params, timeout: 10000 });
    return res.data;
  } catch (e) {
    const status = e.response?.status;
    const msg    = e.response?.data?.msg || e.message;
    console.error(`[BEACON] GET failed (${status}): ${url} — ${msg}`);
    return null;
  }
}

// ── MATH HELPERS ──────────────────────────────────────────────────────────────
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses += Math.abs(diff);
  }
  const avgGain = gains  / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

function calculateVolatility(closes) {
  if (closes.length < 5) return 0;
  const returns = [];
  for (let i = 1; i < closes.length; i++)
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1] * 100);
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return parseFloat(Math.sqrt(variance).toFixed(3));
}

function calculateMA(closes, period = 20) {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ── INTELLIGENCE LAYER ────────────────────────────────────────────────────────
function calcDCAScore({ rsi, fundingRate, fearGreed, volatility }) {
  const rsiScore = rsi <= 30 ? 25 : rsi >= 70 ? 0 : ((70 - rsi) / 40) * 25;
  const fr       = parseFloat(fundingRate ?? 0);
  const frScore  = fr < -0.0001 ? 25 : fr > 0.0005 ? 0 : ((0.0005 - fr) / 0.0006) * 25;
  const fg       = parseInt(fearGreed ?? 50);
  const fgScore  = fg <= 25 ? 25 : fg >= 75 ? 0 : ((75 - fg) / 50) * 25;
  const vol      = parseFloat(volatility ?? 2);
  const volScore = (vol >= 1 && vol <= 3) ? 25 : vol < 1 ? 10 : vol > 6 ? 5 : ((6 - vol) / 3) * 20;
  return Math.min(100, Math.round(rsiScore + frScore + fgScore + volScore));
}

function classifyRegime({ rsi, fundingRate, fearGreed, volatility }) {
  const fr  = parseFloat(fundingRate ?? 0);
  const vol = parseFloat(volatility  ?? 2);
  if (fearGreed <= 20 && rsi <= 30) return {
    name:'CAPITULATION', label:'Market Capitulation', tier:'bullish',
    desc:'Extreme fear and deeply oversold RSI. Highest-conviction DCA entry — retail panic-selling into your buys. Historically precedes significant recoveries.',
    playbook:'DCA — Full allocation. Start immediately.',
  };
  if (fearGreed <= 35 && rsi <= 45 && fr < 0) return {
    name:'ACCUMULATION', label:'Accumulation Zone', tier:'bullish',
    desc:'Fear dominates sentiment, RSI is weak, and futures traders are net short. Classic early-accumulation territory — systematic DCA is exactly the right approach here.',
    playbook:'DCA — Standard allocation.',
  };
  if (fearGreed >= 75 && rsi >= 70) return {
    name:'DISTRIBUTION', label:'Distribution Phase', tier:'bearish',
    desc:'Extreme greed with overbought price action. Smart money selling into retail enthusiasm. Avoid DCA here — wait for sentiment to reset before accumulating.',
    playbook:'Pause DCA. Trend-Following Playbook if you must stay active.',
  };
  if (vol > 4 && rsi >= 60 && fr > 0.0003) return {
    name:'EUPHORIA', label:'Euphoria / FOMO Phase', tier:'bearish',
    desc:'High volatility, crowded long futures, and elevated RSI signal a market in FOMO. Late-cycle DCA risks buying the top into a sharp reversal.',
    playbook:'Trend-Following Playbook — Do not DCA.',
  };
  if (vol < 1.5 && Math.abs(fr) < 0.0001 && fearGreed >= 40 && fearGreed <= 60) return {
    name:'CONSOLIDATION', label:'Range Consolidation', tier:'neutral',
    desc:'Low volatility, neutral funding, neutral sentiment. Market coiling before its next move. Grid strategies profit from oscillation within the range.',
    playbook:'Grid Trading Playbook — Ideal conditions.',
  };
  if (rsi >= 55 && fearGreed >= 55 && fr > 0) return {
    name:'EXPANSION', label:'Bull Market Expansion', tier:'neutral',
    desc:'Positive momentum, healthy sentiment, mild long bias in futures. Bull market intact. DCA with reduced allocation to avoid late-cycle top.',
    playbook:'DCA — Reduced allocation (30–50% of standard).',
  };
  return {
    name:'NEUTRAL', label:'Neutral / Mixed Signals', tier:'neutral',
    desc:'Signals not strongly aligned in any direction. Standard DCA allocation is appropriate. Monitor for a regime shift toward Accumulation or Distribution.',
    playbook:'DCA — Standard allocation.',
  };
}

function optimizeDCAInterval(volatility, score) {
  const vol = parseFloat(volatility ?? 2);
  if (vol > 4)     return { days:3,  label:'Every 3 days',  reason:'High volatility — frequent small buys average extreme dips better than weekly.' };
  if (vol > 2.5)   return { days:5,  label:'Every 5 days',  reason:'Elevated volatility — semi-frequent accumulation captures more of the swings.' };
  if (score >= 65) return { days:7,  label:'Every 7 days',  reason:'Strong entry conditions — weekly DCA maximises allocation into the favorable window.' };
  if (score >= 45) return { days:10, label:'Every 10 days', reason:'Mixed signals — stretch interval and reduce per-cycle exposure.' };
  return               { days:14, label:'Every 14 days', reason:'Unfavorable conditions — bi-weekly minimum commitment only until signals improve.' };
}

function generatePlaybookConfig({ regime, pair, score, interval }) {
  const strategy = regime.name === 'CONSOLIDATION' ? 'Grid Trading'
    : (regime.name === 'DISTRIBUTION' || regime.name === 'EUPHORIA') ? 'Trend-Following'
    : 'DCA';
  const allocation = score >= 65 ? '$100 per cycle (full)' : score >= 45 ? '$50 per cycle (reduced)' : '$25 per cycle (minimal)';
  return {
    strategy,
    pair:            pair.replace('USDT', '/USDT'),
    amountPerCycle:  allocation,
    frequency:       interval.label,
    entryCondition:  'RSI < 50 AND Fear & Greed < 55',
    pauseCondition:  'RSI > 70 OR Fear & Greed > 70',
    regime:          regime.label,
    confidence:      score >= 65 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
    recommendation:  regime.playbook,
    optimizerReason: interval.reason,
    generatedAt:     new Date().toISOString(),
  };
}

function fallbackAnalysis(score, regime) {
  const r = regime?.label || 'Neutral Market';
  if (score >= 65) return `Current market is in a ${r} — RSI is approaching oversold territory, Fear & Greed shows fear, and the negative funding rate signals bearish futures overcrowding. This is a strong DCA entry window that historically precedes significant recoveries as retail capitulation creates favorable average prices. Configure Bitget GetAgent Playbook with a DCA strategy at your BEACON-recommended interval and standard cycle amount.`;
  if (score >= 45) return `Market signals indicate a ${r} — conditions are mixed without a strong directional bias in any signal. A conservative DCA approach with reduced per-cycle amounts is appropriate while waiting for clearer signal alignment. Bitget GetAgent Playbook DCA at a stretched interval, or Grid Trading if volatility remains low, are both reasonable choices.`;
  return `Current regime is ${r} — greed or strong momentum signals dominate, making this a poor DCA entry point. Aggressive accumulation here risks buying into a late-cycle top. Pause DCA and consider a Trend-Following Playbook on Bitget GetAgent to ride existing momentum rather than averaging against it.`;
}

// ── CORE: FETCH SIGNALS FOR ONE SYMBOL (shared by /signals, /radar, /agent-feed) ──
async function fetchSignalsForSymbol(symbol, sharedFG = null) {
  const [candleData, fundingData, oiData, fgData] = await Promise.all([
    get(`${BITGET}/api/v2/spot/market/candles`, { symbol, granularity: '1day', limit: '30' }),
    get(`${BITGET}/api/v2/mix/market/current-fund-rate`, { symbol, productType: 'USDT-FUTURES' }),
    get(`${BITGET}/api/v2/mix/market/open-interest`,    { symbol, productType: 'USDT-FUTURES' }),
    sharedFG ? Promise.resolve(sharedFG) : get('https://api.alternative.me/fng/', { limit: 2, format: 'json' }),
  ]);

  let rsi = 50, volatility = 2, currentPrice = null;
  if (candleData?.data?.length) {
    const closes = candleData.data.map(c => parseFloat(c[4]));
    rsi          = calculateRSI(closes, 14);
    volatility   = calculateVolatility(closes);
    currentPrice = closes[0]; // Bitget returns newest first
  }

  let fundingRate = null;
  if (fundingData?.data?.length) fundingRate = parseFloat(fundingData.data[0].fundingRate);

  let oiValue = null;
  if (oiData?.data) oiValue = parseFloat(oiData.data.size ?? oiData.data.openInterestList?.[0]?.size ?? 0);

  let fearGreed = 50, fearGreedLabel = 'Neutral';
  const fgSource = sharedFG || fgData;
  if (fgSource?.data?.[0]) {
    fearGreed      = parseInt(fgSource.data[0].value);
    fearGreedLabel = fgSource.data[0].value_classification;
  }

  const dcaScore = calcDCAScore({ rsi, fundingRate, fearGreed, volatility });
  const regime   = classifyRegime({ rsi, fundingRate, fearGreed, volatility });
  const interval = optimizeDCAInterval(volatility, dcaScore);
  const playbook = generatePlaybookConfig({ regime, pair: symbol, score: dcaScore, interval });

  return {
    symbol,
    display:       symbol.replace('USDT', '/USDT'),
    currentPrice,
    rsi:           parseFloat(rsi.toFixed(2)),
    fundingRate,
    oiValue,
    fearGreed,
    fearGreedLabel,
    volatility:    parseFloat(volatility.toFixed(3)),
    dcaScore,
    regime,
    interval,
    playbook,
    timestamp:     Date.now(),
  };
}

// ── HISTORICAL REGIME (shared by /regime-history, /autopsy) ──────────────────
function regimeHistorical(rsi, fg) {
  if (fg <= 20 && rsi <= 30) return { name:'CAPITULATION', tier:'bullish', label:'Market Capitulation' };
  if (fg <= 35 && rsi <= 45) return { name:'ACCUMULATION', tier:'bullish', label:'Accumulation Zone'   };
  if (fg >= 75 && rsi >= 70) return { name:'DISTRIBUTION', tier:'bearish', label:'Distribution Phase'  };
  if (fg >= 65 && rsi >= 60) return { name:'EUPHORIA',     tier:'bearish', label:'Euphoria Phase'      };
  if (rsi >= 55 && fg >= 55) return { name:'EXPANSION',    tier:'neutral', label:'Bull Expansion'      };
  if (rsi >= 42 && rsi <= 58 && fg >= 42 && fg <= 58)
                             return { name:'CONSOLIDATION', tier:'neutral', label:'Range Consolidation'  };
  return                            { name:'NEUTRAL',       tier:'neutral', label:'Neutral Market'      };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── CANDLES ───────────────────────────────────────────────────────────────────
app.get('/api/candles', async (req, res) => {
  const { symbol = 'BTCUSDT', granularity = '1day', limit = '90' } = req.query;
  const data = await get(`${BITGET}/api/v2/spot/market/candles`, { symbol, granularity, limit });
  if (!data) return res.status(503).json({ error: 'Bitget candles unavailable' });
  res.json(data);
});

// ── FEAR & GREED ──────────────────────────────────────────────────────────────
app.get('/api/fear-greed', async (req, res) => {
  const data = await get('https://api.alternative.me/fng/', { limit: 90, format: 'json' });
  if (!data) return res.status(503).json({ error: 'Fear & Greed unavailable' });
  res.json(data);
});

// ── LIVE TICKER (price + 24h change for header display) ──────────────────────
app.get('/api/ticker', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  const data = await get(`${BITGET}/api/v2/spot/market/tickers`, { symbol });
  if (!data?.data?.[0]) return res.status(503).json({ error: 'Ticker unavailable' });
  const t = data.data[0];
  res.json({
    symbol,
    price:    parseFloat(t.lastPr   || t.close  || 0),
    change24h:parseFloat(t.change24h || t.changeUtc24h || 0),
    high24h:  parseFloat(t.high24h  || t.high   || 0),
    low24h:   parseFloat(t.low24h   || t.low    || 0),
    volume24h:parseFloat(t.usdtVol  || t.quoteVol|| 0),
  });
});

// ── DYNAMIC PAIRS (top 25 USDT pairs by 24h volume from Bitget) ──────────────
app.get('/api/pairs', async (req, res) => {
  const data = await get(`${BITGET}/api/v2/spot/market/tickers`);
  if (!data?.data) return res.status(503).json({ error: 'Pairs unavailable' });

  const MIN_VOL = 500000; // $500k minimum 24h USDT volume
  const pairs = data.data
    .filter(t => {
      if (!t.symbol.endsWith('USDT')) return false;
      const vol = parseFloat(t.usdtVol || t.quoteVol || 0);
      return vol > MIN_VOL;
    })
    .sort((a, b) => {
      const va = parseFloat(a.usdtVol || a.quoteVol || 0);
      const vb = parseFloat(b.usdtVol || b.quoteVol || 0);
      return vb - va;
    })
    .slice(0, 25)
    .map(t => ({
      symbol:   t.symbol,
      display:  t.symbol.replace('USDT', '/USDT'),
      base:     t.symbol.replace('USDT', ''),
      price:    parseFloat(t.lastPr || t.close || 0),
      change24h:parseFloat(t.change24h || t.changeUtc24h || 0),
      volume:   parseFloat(t.usdtVol || t.quoteVol || 0),
    }));

  res.json({ pairs, timestamp: Date.now() });
});

// ── MASTER SIGNALS ────────────────────────────────────────────────────────────
app.get('/api/signals', async (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';
  const payload = await fetchSignalsForSymbol(symbol);
  saveToSamples('signals.json', payload);
  res.json(payload);
});

// ── AI ANALYSIS ───────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { rsi, fundingRate, fearGreed, volatility, dcaScore, regime, symbol = 'BTCUSDT' } = req.body;
  if (!process.env.GROQ_API_KEY) return res.json({ analysis: fallbackAnalysis(dcaScore, regime) });

  const fr  = fundingRate != null ? (parseFloat(fundingRate) * 100).toFixed(4) + '%' : 'unavailable';
  const prompt = `You are a market intelligence layer for Bitget's GetAgent Playbook.

Live signals for ${symbol}:
- RSI (14-day): ${rsi?.toFixed(1)} — below 30 oversold; above 70 overbought
- Funding Rate: ${fr} — negative = shorts paying longs (bullish lean); strongly positive = crowded longs (risk)
- Fear & Greed: ${fearGreed}/100 — below 25 = Extreme Fear = best DCA zone; above 75 = Extreme Greed
- Daily Volatility: ${volatility?.toFixed(2)}% — high = more frequent smaller buys
- DCA Entry Score: ${dcaScore}/100
- Market Regime: ${regime?.name} — ${regime?.label}
- Regime Description: ${regime?.desc}

Write exactly 3 sentences. Sentence 1: what the ${regime?.name} regime and signals mean right now. Sentence 2: whether this is a strong, moderate, or poor moment to DCA and specifically why. Sentence 3: which Bitget GetAgent Playbook strategy to use and one concrete configuration detail.`;

  try {
    const response = await axios.post(GROQ, {
      model: 'llama-3.1-8b-instant',
      messages: [{ role:'user', content: prompt }],
      max_tokens: 320, temperature: 0.32,
    }, {
      headers: { Authorization:`Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type':'application/json' },
      timeout: 14000,
    });
    const analysis = response.data.choices[0].message.content;
    saveToSamples('analysis.json', {
      request:  { symbol, rsi, fundingRate, fearGreed, volatility, dcaScore, regime: regime?.name },
      response: { analysis },
      model:    'llama-3.1-8b-instant',
    });
    res.json({ analysis });
  } catch (e) {
    console.error('[BEACON] Groq error:', e.response?.data || e.message);
    res.json({ analysis: fallbackAnalysis(dcaScore, regime) });
  }
});

// ── BACKTEST (improved Smart DCA with MA20 trend filter) ─────────────────────
app.post('/api/backtest', async (req, res) => {
  const { candles, fearGreedHistory, amount = 100, interval = 7, symbol = 'BTCUSDT' } = req.body;
  if (!candles || candles.length < 21) {
    return res.status(400).json({ error: 'Need at least 21 candles. Bitget API may be temporarily unavailable — retry in a moment.' });
  }

  const closes     = candles.map(c => parseFloat(c[4]));
  const timestamps = candles.map(c => parseInt(c[0]));
  const rsiSeries  = closes.map((_, i) => calculateRSI(closes.slice(0, i + 1), 14));
  const fgAligned  = fearGreedHistory ? [...fearGreedHistory].reverse() : [];

  // MA20 series for trend filter
  const ma20Series = closes.map((_, i) => {
    if (i < 20) return closes[i];
    return closes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
  });

  const plain = { cash:1000, units:0, values:[], buys:0 };
  const smart = { cash:1000, units:0, values:[], buys:0 };

  closes.forEach((price, i) => {
    const fg   = fgAligned[i]?.value ? parseInt(fgAligned[i].value) : 50;
    const rsi  = rsiSeries[i] || 50;
    const ma20 = ma20Series[i];

    // Plain DCA: buy every `interval` candles, no conditions
    if (i > 0 && i % interval === 0 && plain.cash >= amount) {
      plain.units += amount / price;
      plain.cash  -= amount;
      plain.buys  += 1;
    }

    // Smart DCA: two entry conditions
    // 1. CAPITULATION: RSI deeply oversold (<28) OR extreme fear (<20) — buy regardless of trend
    // 2. ACCUMULATION DIP: fear present + RSI oversold + price within 5% below MA20 (not in deep downtrend)
    const capitulation     = rsi < 28 || fg < 20;
    const accumulationDip  = fg < 50 && rsi < 40 && price >= ma20 * 0.95;

    if ((capitulation || accumulationDip) && smart.cash >= amount) {
      smart.units += amount / price;
      smart.cash  -= amount;
      smart.buys  += 1;
    }

    plain.values.push({ t:timestamps[i], v:parseFloat((plain.cash + plain.units * price).toFixed(2)) });
    smart.values.push({ t:timestamps[i], v:parseFloat((smart.cash + smart.units * price).toFixed(2)) });
  });

  const fp = closes[closes.length - 1];
  const pF = plain.cash + plain.units * fp;
  const sF = smart.cash + smart.units * fp;

  function sharpe(values) {
    if (values.length < 2) return 0;
    const rets = values.slice(1).map((v, i) => (v.v - values[i].v) / values[i].v * 100);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const std  = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    return std > 0 ? parseFloat((mean / std).toFixed(3)) : 0;
  }

  function maxDrawdown(values) {
    let peak = values[0].v, maxDD = 0;
    for (const { v } of values) {
      if (v > peak) peak = v;
      const dd = (peak - v) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return parseFloat(maxDD.toFixed(2));
  }

  const result = {
    plain: {
      values:plain.values, finalValue:parseFloat(pF.toFixed(2)),
      totalBuys:plain.buys, returnPct:parseFloat(((pF-1000)/1000*100).toFixed(2)),
      sharpe:sharpe(plain.values), maxDrawdown:maxDrawdown(plain.values),
    },
    smart: {
      values:smart.values, finalValue:parseFloat(sF.toFixed(2)),
      totalBuys:smart.buys, returnPct:parseFloat(((sF-1000)/1000*100).toFixed(2)),
      sharpe:sharpe(smart.values), maxDrawdown:maxDrawdown(smart.values),
    },
    meta: {
      symbol, days:closes.length, interval,
      startPrice:closes[0], endPrice:fp,
      priceChange:parseFloat(((fp-closes[0])/closes[0]*100).toFixed(2)),
      smartDCAMethod:'Capitulation (RSI<28 or F&G<20) + Accumulation Dip (RSI<40, F&G<50, price≥MA20×0.95)',
    },
  };

  saveToSamples('backtest.json', result);
  res.json(result);
});

// ── MULTI-PAIR RADAR ──────────────────────────────────────────────────────────
app.get('/api/radar', async (req, res) => {
  const PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT'];

  // Fetch F&G once — market-wide, shared across all pairs
  const fgData    = await get('https://api.alternative.me/fng/', { limit:2, format:'json' });
  const fearGreed      = fgData?.data?.[0] ? parseInt(fgData.data[0].value) : 50;
  const fearGreedLabel = fgData?.data?.[0]?.value_classification || 'Neutral';

  const pairResults = await Promise.all(
    PAIRS.map(symbol => fetchSignalsForSymbol(symbol, fgData))
  );

  const ranked = pairResults
    .filter(p => p.rsi !== 50 || p.fundingRate !== null) // filter pairs with no data
    .sort((a, b) => b.dcaScore - a.dcaScore);

  const result = { pairs:ranked, fearGreed, fearGreedLabel, timestamp:Date.now() };
  saveToSamples('radar.json', result);
  res.json(result);
});

// ── REGIME HISTORY CALENDAR (30 days) ────────────────────────────────────────
app.get('/api/regime-history', async (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';
  const [candleData, fgData] = await Promise.all([
    get(`${BITGET}/api/v2/spot/market/candles`, { symbol, granularity:'1day', limit:'30' }),
    get('https://api.alternative.me/fng/', { limit:30, format:'json' }),
  ]);
  if (!candleData?.data?.length) return res.status(503).json({ error:'Candle data unavailable' });

  const candles    = [...candleData.data].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const closes     = candles.map(c => parseFloat(c[4]));
  const timestamps = candles.map(c => parseInt(c[0]));
  const fgAligned  = fgData?.data ? [...fgData.data].reverse() : [];
  const rsiSeries  = closes.map((_, i) => calculateRSI(closes.slice(0, i+1), 14));

  const history = candles.map((_, i) => {
    const rsi = rsiSeries[i];
    const fg  = fgAligned[i] ? parseInt(fgAligned[i].value) : 50;
    const r   = regimeHistorical(rsi, fg);
    return {
      timestamp: timestamps[i],
      date:      new Date(timestamps[i]).toISOString().split('T')[0],
      regime:    r.name,
      tier:      r.tier,
      label:     r.label,
      rsi:       parseFloat(rsi.toFixed(1)),
      fearGreed: fg,
      price:     parseFloat(closes[i].toFixed(2)),
    };
  });

  res.json({ symbol, history, timestamp:Date.now() });
});

// ── SIGNAL AUTOPSY ────────────────────────────────────────────────────────────
app.get('/api/autopsy', async (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';
  const [candleData, fgData] = await Promise.all([
    get(`${BITGET}/api/v2/spot/market/candles`, { symbol, granularity:'1day', limit:'90' }),
    get('https://api.alternative.me/fng/', { limit:90, format:'json' }),
  ]);
  if (!candleData?.data || candleData.data.length < 22)
    return res.status(503).json({ error:'Not enough historical data from Bitget for autopsy.' });

  const candles    = [...candleData.data].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const closes     = candles.map(c => parseFloat(c[4]));
  const timestamps = candles.map(c => parseInt(c[0]));
  const fgAligned  = fgData?.data ? [...fgData.data].reverse() : [];
  const rsiSeries  = closes.map((_, i) => calculateRSI(closes.slice(0, i+1), 14));
  const LOOKAHEAD  = 14;
  const signalHistory = [];

  for (let i = 15; i < closes.length - LOOKAHEAD; i++) {
    const rsi  = rsiSeries[i];
    const fg   = fgAligned[i] ? parseInt(fgAligned[i].value) : 50;
    const reg  = regimeHistorical(rsi, fg);
    const price    = closes[i];
    const price7d  = closes[i + 7];
    const price14d = closes[i + 14];
    signalHistory.push({
      timestamp: timestamps[i],
      regime: reg.name, tier: reg.tier, label: reg.label,
      rsi: parseFloat(rsi.toFixed(1)), fearGreed: fg,
      price: parseFloat(price.toFixed(2)),
      return7d:  parseFloat(((price7d  - price) / price * 100).toFixed(2)),
      return14d: parseFloat(((price14d - price) / price * 100).toFixed(2)),
    });
  }

  const REGIME_NAMES = ['CAPITULATION','ACCUMULATION','EXPANSION','CONSOLIDATION','NEUTRAL','DISTRIBUTION','EUPHORIA'];
  const accuracy = {};
  for (const name of REGIME_NAMES) {
    const days = signalHistory.filter(s => s.regime === name);
    if (!days.length) continue;
    const isBullish = ['CAPITULATION','ACCUMULATION'].includes(name);
    const isBearish = ['DISTRIBUTION','EUPHORIA'].includes(name);
    const hit7d  = days.filter(d => isBullish ? d.return7d > 0  : isBearish ? d.return7d < 0  : d.return7d > -3).length;
    const hit14d = days.filter(d => isBullish ? d.return14d > 0 : isBearish ? d.return14d < 0 : d.return14d > -3).length;
    const avg7d  = days.reduce((a, b) => a + b.return7d,  0) / days.length;
    const avg14d = days.reduce((a, b) => a + b.return14d, 0) / days.length;
    accuracy[name] = {
      count:days.length, isBullish, isBearish,
      hitRate7d:  parseFloat((hit7d  / days.length * 100).toFixed(1)),
      hitRate14d: parseFloat((hit14d / days.length * 100).toFixed(1)),
      avgReturn7d: parseFloat(avg7d.toFixed(2)), avgReturn14d: parseFloat(avg14d.toFixed(2)),
    };
  }

  const bullDays = signalHistory.filter(s => s.tier === 'bullish');
  const bearDays = signalHistory.filter(s => s.tier === 'bearish');

  const result = {
    symbol, accuracy, signalHistory,
    summary: {
      totalDaysAnalyzed:      signalHistory.length,
      bullishSignalsIssued:   bullDays.length,
      bearishSignalsIssued:   bearDays.length,
      bullishAccuracy7d:      bullDays.length > 0 ? parseFloat((bullDays.filter(d=>d.return7d>0).length / bullDays.length * 100).toFixed(1)) : null,
      bearishAccuracy7d:      bearDays.length > 0 ? parseFloat((bearDays.filter(d=>d.return7d<0).length / bearDays.length * 100).toFixed(1)) : null,
      priceStart:             closes[0],
      priceEnd:               closes[closes.length-1],
      priceChange:            parseFloat(((closes[closes.length-1]-closes[0])/closes[0]*100).toFixed(2)),
      methodology:            'RSI + Fear & Greed only (historical funding rate unavailable from public API)',
    },
    timestamp: Date.now(),
  };

  saveToSamples('autopsy.json', result);
  res.json(result);
});

// ── AGENT SIGNAL FEED (structured JSON for AI agents and MCP tools) ───────────
app.get('/api/agent-feed', async (req, res) => {
  const symbol = req.query.symbol || 'BTCUSDT';
  const s      = await fetchSignalsForSymbol(symbol);

  const action = s.dcaScore >= 65 ? 'DCA_BUY'
               : s.dcaScore >= 40 ? 'DCA_HOLD'
               : 'DCA_PAUSE';

  const feed = {
    schema:      'beacon-agent-feed-v1',
    description: 'BEACON signal feed for Bitget AI agents and MCP-compatible tools',
    symbol,
    timestamp:   s.timestamp,
    validUntilMs:s.timestamp + 4 * 60 * 60 * 1000,
    action,
    confidence:  s.playbook.confidence,
    regime:      s.regime.name,
    regimeLabel: s.regime.label,
    playbook:    s.playbook.strategy,
    playbook_config: s.playbook,
    signals: {
      rsi:             s.rsi,
      funding_rate:    s.fundingRate,
      fear_greed:      s.fearGreed,
      fear_greed_label:s.fearGreedLabel,
      volatility_pct:  s.volatility,
      open_interest:   s.oiValue,
      dca_entry_score: s.dcaScore,
    },
    interval:    s.interval,
    reasoning:   `${s.regime.desc} ${s.interval.reason}`,
    usage_example: {
      curl: `curl "${req.protocol}://${req.get('host')}/api/agent-feed?symbol=${symbol}"`,
      mcp_note: 'This endpoint returns a standardised action payload that any Bitget GetAgent or MCP-connected system can consume directly without parsing raw signal data.',
    },
  };

  saveToSamples('agent-feed.json', feed);
  res.json(feed);
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔦 BEACON running → http://localhost:${PORT}`);
  console.log(`   Bitget API    : connected (public endpoints)`);
  console.log(`   Groq AI       : ${process.env.GROQ_API_KEY ? 'connected (llama-3.1-8b-instant)' : 'NOT SET — add GROQ_API_KEY to .env'}`);
  console.log(`   Auto-logger   : ON — /samples auto-written on every request`);
  console.log(`   Routes        : signals | analyze | backtest | radar | autopsy | agent-feed | regime-history | ticker | pairs`);
  console.log(`   Smart DCA     : MA20 trend filter + capitulation override\n`);
});