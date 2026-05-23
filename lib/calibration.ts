// Kalibreringssporing — måler om modellens sannsynligheter stemmer med virkeligheten
//
// Brier Score: gjennomsnitt av (spådd_prob − faktisk_utfall)²
//   0 = perfekt, 0.25 = like bra som å alltid si 50%, 1 = verst mulig
//
// Kalibrering: hvis modellen sier 65% → vinner den ca. 65% av de gangene?

import { getBetResults } from "./result-store";

export interface CalibrationBin {
  label: string;         // "55–65%"
  count: number;         // antall bets i dette spannet
  wins: number;
  predictedAvg: number;  // gj.snittlig spådd prob i binnen
  actualRate: number;    // faktisk vinnrate
  delta: number;         // actualRate − predictedAvg (+ = undervurdert, − = overvurdert)
}

export interface MarketCalibration {
  market: string;
  brierScore: number;
  count: number;
  wins: number;
}

export interface CalibrationStats {
  totalResolved: number;    // avgjorte bets (won + lost)
  brierScore: number | null;
  /** Brier Skill Score vs naiv 50%-modell: positiv = bedre enn tilfeldig */
  brierSkill: number | null;
  /** Gjennomsnittlig spådd prob over alle bets */
  avgPredicted: number | null;
  /** Faktisk vinnrate over alle bets */
  actualWinRate: number | null;
  /** Kalibreringsbias: actualWinRate − avgPredicted (+= undervurdert, −= overvurdert) */
  calibrationBias: number | null;
  bins: CalibrationBin[];
  perMarket: MarketCalibration[];
}

const BINS: { label: string; min: number; max: number }[] = [
  { label: "<40%",   min: 0.00, max: 0.40 },
  { label: "40–50%", min: 0.40, max: 0.50 },
  { label: "50–60%", min: 0.50, max: 0.60 },
  { label: "60–70%", min: 0.60, max: 0.70 },
  { label: "70–80%", min: 0.70, max: 0.80 },
  { label: ">80%",   min: 0.80, max: 1.01 },
];

export function computeCalibration(): CalibrationStats {
  const all = getBetResults().filter(r => r.outcome === "won" || r.outcome === "lost");

  if (all.length === 0) {
    return {
      totalResolved: 0, brierScore: null, brierSkill: null,
      avgPredicted: null, actualWinRate: null, calibrationBias: null,
      bins: [], perMarket: [],
    };
  }

  // ── Brier Score ──────────────────────────────────────────────────────────
  let brierSum = 0;
  let predSum  = 0;
  let wins     = 0;

  for (const r of all) {
    const actual = r.outcome === "won" ? 1 : 0;
    brierSum += (r.ourProbability - actual) ** 2;
    predSum  += r.ourProbability;
    wins     += actual;
  }

  const n          = all.length;
  const brierScore = Math.round(brierSum / n * 1000) / 1000;
  // Naiv referanse: alltid si 50% → Brier = 0.25
  const brierRef   = 0.25;
  const brierSkill = Math.round((1 - brierScore / brierRef) * 1000) / 10;

  const avgPredicted  = Math.round(predSum / n * 1000) / 10; // prosent
  const actualWinRate = Math.round(wins / n * 1000) / 10;    // prosent
  const calibBias     = Math.round((actualWinRate - avgPredicted) * 10) / 10;

  // ── Kalibreringsplott (bins) ─────────────────────────────────────────────
  const bins: CalibrationBin[] = BINS.map(b => {
    const inBin = all.filter(r => r.ourProbability >= b.min && r.ourProbability < b.max);
    if (inBin.length === 0) return null;

    const binWins   = inBin.filter(r => r.outcome === "won").length;
    const predicted = inBin.reduce((s, r) => s + r.ourProbability, 0) / inBin.length;
    const actual    = binWins / inBin.length;

    return {
      label:        b.label,
      count:        inBin.length,
      wins:         binWins,
      predictedAvg: Math.round(predicted * 1000) / 10,
      actualRate:   Math.round(actual    * 1000) / 10,
      delta:        Math.round((actual - predicted) * 1000) / 10,
    };
  }).filter(Boolean) as CalibrationBin[];

  // ── Per-marked kalibrering ───────────────────────────────────────────────
  const mktMap = new Map<string, { sum: number; count: number; wins: number }>();
  for (const r of all) {
    // Normaliser markedsnavn: "Hjemmeseier (1)" → "1X2", "BTTS Ja" → "BTTS", osv.
    const mkt =
      r.market.startsWith("AH")        ? "Asian Handicap"
      : r.market.startsWith("BTTS")    ? "BTTS"
      : r.market.startsWith("Over")    ? "Over/Under"
      : r.market.startsWith("Under")   ? "Over/Under"
      : "1X2";
    const entry = mktMap.get(mkt) ?? { sum: 0, count: 0, wins: 0 };
    const actual = r.outcome === "won" ? 1 : 0;
    entry.sum  += (r.ourProbability - actual) ** 2;
    entry.count++;
    entry.wins += actual;
    mktMap.set(mkt, entry);
  }

  const perMarket: MarketCalibration[] = [...mktMap.entries()]
    .map(([market, { sum, count, wins: w }]) => ({
      market,
      brierScore: Math.round(sum / count * 1000) / 1000,
      count,
      wins: w,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalResolved: n,
    brierScore,
    brierSkill,
    avgPredicted,
    actualWinRate,
    calibrationBias: calibBias,
    bins,
    perMarket,
  };
}
