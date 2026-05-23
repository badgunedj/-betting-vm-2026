// Lokal lagring av match-analyser i localStorage
// Analyser lagres per kamp (homeTeam::awayTeam::dato) og gjenbrukes
// slik at vi ikke kaller Claude/APIer for samme kamp to ganger

import { MatchAnalysis } from "./analyze";
import { MatchOdds } from "./odds-api";

export interface SavedAnalysis {
  key: string;
  homeTeam: string;
  awayTeam: string;
  date: string;        // ISO-dato fra fixture
  sport: string;
  analysis: MatchAnalysis;
  odds: MatchOdds | null;
  savedAt: string;     // når analysen ble kjørt
}

const STORAGE_KEY = "bettingbot_analyses_v2";
const MAX_ENTRIES  = 150;

// ── Intern hjelpere ──────────────────────────────────────────────────────────

function getStore(): Record<string, SavedAnalysis> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function setStore(data: Record<string, SavedAnalysis>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage nesten full — fjern de 20 eldste
    const entries = Object.entries(data).sort(
      ([, a], [, b]) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
    );
    entries.slice(0, 20).forEach(([k]) => delete data[k]);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* gi opp */ }
  }
}

// ── Offentlige funksjoner ────────────────────────────────────────────────────

/** Lag en unik nøkkel for kampen (dato uten klokkeslett) */
export function makeMatchKey(homeTeam: string, awayTeam: string, date: string): string {
  const day = date.split("T")[0];
  return `${homeTeam}::${awayTeam}::${day}`;
}

/** Lagre en analyse (overskriver evt. gammel for samme kamp) */
export function saveAnalysis(entry: SavedAnalysis): void {
  const store = getStore();
  store[entry.key] = { ...entry, savedAt: new Date().toISOString() };

  // Trim til MAX_ENTRIES (fjern eldste)
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    const sorted = Object.entries(store).sort(
      ([, a], [, b]) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
    );
    sorted.slice(0, keys.length - MAX_ENTRIES).forEach(([k]) => delete store[k]);
  }

  setStore(store);
}

/** Hent lagret analyse for en kamp (null hvis ikke finnes) */
export function loadAnalysis(key: string): SavedAnalysis | null {
  return getStore()[key] ?? null;
}

/** Alle lagrede analyser sortert nyeste først */
export function getAllAnalyses(): SavedAnalysis[] {
  return Object.values(getStore()).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

/** Slett en enkelt analyse */
export function deleteAnalysis(key: string): void {
  const store = getStore();
  delete store[key];
  setStore(store);
}

/** Slett alle analyser */
export function clearAllAnalyses(): void {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}

/** Antall lagrede analyser */
export function analysisCount(): number {
  return Object.keys(getStore()).length;
}
