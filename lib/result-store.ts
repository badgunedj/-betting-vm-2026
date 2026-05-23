// Resultat-logging: spor vant/tapte bets og P&L over tid
// Lukker feedback-loopen — vet du om systemet faktisk har edge?

const RESULT_KEY = "bettingbot_results_v1";
const MAX_ENTRIES = 500;

export type BetOutcome = "pending" | "won" | "lost" | "void";

export interface BetResult {
  id: string;           // `${matchKey}_${market}`
  matchKey: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  market: string;
  bookmaker: string;
  odds: number;
  stake: number;
  ourProbability: number;
  valueEdgePct: number;
  evNOK: number;
  outcome: BetOutcome;
  profit: number;       // positive = gevinst, negativ = tap, 0 = pending/void
  loggedAt: string;
  resolvedAt: string | null;
}

function load(): BetResult[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) ?? "[]") as BetResult[];
  } catch { return []; }
}

function persist(entries: BetResult[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RESULT_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

/** Legg til et bet som "pending" (venter på utfall) */
export function addPendingBet(entry: Omit<BetResult, "id" | "outcome" | "profit" | "loggedAt" | "resolvedAt">): void {
  const all = load();
  const id = `${entry.matchKey}_${entry.market}`;
  if (all.find(x => x.id === id)) return; // allerede logget
  all.push({
    ...entry, id,
    outcome: "pending",
    profit: 0,
    loggedAt: new Date().toISOString(),
    resolvedAt: null,
  });
  persist(all);
}

/** Oppdater utfallet av et bet */
export function resolveBet(id: string, outcome: "won" | "lost" | "void"): void {
  const all = load();
  const idx = all.findIndex(x => x.id === id);
  if (idx === -1) return;
  const entry = all[idx];
  const profit =
    outcome === "won"  ? Math.round((entry.odds - 1) * entry.stake) :
    outcome === "lost" ? -entry.stake :
    0; // void = refund
  all[idx] = { ...entry, outcome, profit, resolvedAt: new Date().toISOString() };
  persist(all);
}

export function getBetResults(): BetResult[] {
  return load().slice().reverse(); // nyeste først
}

export interface PnLStats {
  total: number;
  pending: number;
  won: number;
  lost: number;
  void: number;
  totalStaked: number;
  totalProfit: number;
  roi: number | null;       // % av total staked
  winRate: number | null;   // % av avgjorte bets
  avgOdds: number | null;
  avgEdge: number | null;
}

export function getPnLStats(): PnLStats {
  const all = load();
  const resolved = all.filter(b => b.outcome !== "pending" && b.outcome !== "void");
  const won  = all.filter(b => b.outcome === "won").length;
  const lost = all.filter(b => b.outcome === "lost").length;
  const totalStaked  = resolved.reduce((s, b) => s + b.stake, 0);
  const totalProfit  = all.reduce((s, b) => s + b.profit, 0);
  const roi = totalStaked > 0 ? Math.round(totalProfit / totalStaked * 1000) / 10 : null;
  const winRate = resolved.length > 0 ? Math.round(won / resolved.length * 100) : null;
  const avgOdds = resolved.length > 0
    ? Math.round(resolved.reduce((s, b) => s + b.odds, 0) / resolved.length * 100) / 100
    : null;
  const avgEdge = resolved.length > 0
    ? Math.round(resolved.reduce((s, b) => s + b.valueEdgePct, 0) / resolved.length * 10) / 10
    : null;

  return {
    total: all.length,
    pending: all.filter(b => b.outcome === "pending").length,
    won, lost,
    void: all.filter(b => b.outcome === "void").length,
    totalStaked, totalProfit, roi, winRate, avgOdds, avgEdge,
  };
}

export function clearResults(): void {
  if (typeof window !== "undefined") localStorage.removeItem(RESULT_KEY);
}
