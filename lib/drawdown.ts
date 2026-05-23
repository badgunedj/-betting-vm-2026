// Drawdown-beskyttelse: reduser Kelly-fraksjon automatisk ved tap
// Peak bankroll lagres i localStorage — sammenlignes med nåværende bankroll

const PEAK_KEY = "bettingbot_peak_bankroll_v1";

export interface DrawdownStatus {
  peakBankroll: number;
  currentBankroll: number;
  drawdownPct: number;      // 0.18 = 18% drawdown fra topp
  kellyFraction: number;    // effektiv Kelly-fraksjon som brukes
  mode: "normal" | "caution" | "danger";
  message: string;
}

export function getPeakBankroll(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(PEAK_KEY) ?? 0);
}

function updatePeak(current: number): number {
  const stored = getPeakBankroll();
  if (current > stored) {
    localStorage.setItem(PEAK_KEY, String(current));
    return current;
  }
  return stored;
}

export function resetPeakBankroll(bankroll: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PEAK_KEY, String(bankroll));
}

/**
 * Beregn drawdown-status og effektiv Kelly-fraksjon.
 * Kall ved oppstart og ved hver analyse.
 *
 * Terskel:
 *  drawdown < 10%  → normal   → 25% Kelly
 *  drawdown 10-20% → caution  → 15% Kelly  (−40%)
 *  drawdown ≥ 20%  → danger   → 10% Kelly  (−60%) + advarsel
 */
export function getDrawdownStatus(currentBankroll: number): DrawdownStatus {
  const peak = updatePeak(currentBankroll);
  const drawdownPct = peak > 0 ? Math.max(0, (peak - currentBankroll) / peak) : 0;

  let kellyFraction: number;
  let mode: DrawdownStatus["mode"];
  let message: string;

  if (drawdownPct >= 0.20) {
    kellyFraction = 0.10;
    mode = "danger";
    message = `🛑 ${(drawdownPct * 100).toFixed(0)}% drawdown — Kelly redusert til 10%. Stopp og evaluer!`;
  } else if (drawdownPct >= 0.10) {
    kellyFraction = 0.15;
    mode = "caution";
    message = `⚠️ ${(drawdownPct * 100).toFixed(0)}% drawdown — Kelly redusert til 15% (fra 25%).`;
  } else {
    kellyFraction = 0.25;
    mode = "normal";
    message = `✅ Innenfor normal variasjon (${(drawdownPct * 100).toFixed(0)}% fra topp) — 25% Kelly.`;
  }

  return {
    peakBankroll: peak,
    currentBankroll,
    drawdownPct,
    kellyFraction,
    mode,
    message,
  };
}
