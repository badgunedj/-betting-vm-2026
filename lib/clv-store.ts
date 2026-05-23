// CLV (Closing Line Value) tracking
// Måler om oddsen vi fikk ved analyse var bedre enn der markedet endte
//
// Metodikk:
//   1. Første analyse → lagre oddsAtAnalysis (baseline)
//   2. Bruker klikker 🔄 Refresh → lagre nye odds som "closing proxy"
//   3. CLV% = (oddsAtAnalysis / oddsAtRefresh − 1) × 100
//      Positiv CLV = vi fikk bedre pris enn markedet senere → langsiktig edge

const CLV_KEY = "bettingbot_clv_v1";
const MAX_ENTRIES = 300;

export interface CLVEntry {
  id: string;                   // `${matchKey}_${market}`
  matchKey: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  market: string;
  bookmaker: string;
  oddsAtAnalysis: number;       // odds da vi først analyserte
  oddsAtRefresh: number | null; // odds ved neste refresh (closing proxy)
  clvPct: number | null;        // (oddsAtAnalysis / oddsAtRefresh − 1) × 100
  savedAt: string;
  refreshedAt: string | null;
}

function load(): CLVEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CLV_KEY) ?? "[]") as CLVEntry[];
  } catch {
    return [];
  }
}

function persist(entries: CLVEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLV_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

/** Lagre baseline for nye bets (hopper over hvis entry allerede finnes) */
export function saveCLVBaseline(
  entries: Omit<CLVEntry, "id" | "oddsAtRefresh" | "clvPct" | "refreshedAt">[],
): void {
  const all = load();
  let changed = false;
  for (const e of entries) {
    const id = `${e.matchKey}_${e.market}`;
    if (!all.find(x => x.id === id)) {
      all.push({ ...e, id, oddsAtRefresh: null, clvPct: null, refreshedAt: null });
      changed = true;
    }
  }
  if (changed) persist(all);
}

/** Oppdater CLV ved refresh — beregner CLV% automatisk */
export function updateCLVRefresh(
  matchKey: string,
  market: string,
  newOdds: number,
): void {
  const all = load();
  const id = `${matchKey}_${market}`;
  const idx = all.findIndex(x => x.id === id);
  if (idx === -1) return;

  const entry = all[idx];
  // CLV: positiv = vi fikk bedre odds enn closing (godt tegn)
  const clvPct = Math.round((entry.oddsAtAnalysis / newOdds - 1) * 1000) / 10;
  all[idx] = {
    ...entry,
    oddsAtRefresh: newOdds,
    clvPct,
    refreshedAt: new Date().toISOString(),
  };
  persist(all);
}

export function getCLVEntries(): CLVEntry[] {
  return load().slice().reverse(); // nyeste først
}

export interface CLVStats {
  total: number;          // antall bets logget
  withCLV: number;        // antall med refreshed odds
  avgCLV: number | null;  // gjennomsnittlig CLV%
  positivePct: number | null; // % med positiv CLV
}

export function getCLVStats(): CLVStats {
  const entries = load();
  const withCLV = entries.filter(e => e.clvPct !== null);
  if (withCLV.length === 0) {
    return { total: entries.length, withCLV: 0, avgCLV: null, positivePct: null };
  }
  const sum = withCLV.reduce((s, e) => s + (e.clvPct ?? 0), 0);
  const avgCLV = Math.round((sum / withCLV.length) * 10) / 10;
  const positivePct = Math.round((withCLV.filter(e => (e.clvPct ?? 0) > 0).length / withCLV.length) * 100);
  return { total: entries.length, withCLV: withCLV.length, avgCLV, positivePct };
}

export function clearCLVEntries(): void {
  if (typeof window !== "undefined") localStorage.removeItem(CLV_KEY);
}
