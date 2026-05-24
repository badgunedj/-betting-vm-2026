"use client";
import { useState, useEffect, useCallback } from "react";
import type { DagensTipsBet } from "@/app/api/scan/route";

const BOOKMAKER_NAMES: Record<string, string> = {
  betsson:  "Betsson",
  betway:   "Betway",
  pinnacle: "Pinnacle (ref)",
  boabet:   "BoaBet",
};

/** Hvilken fane/marked du klikker på BoaBet for hvert market */
const BOABET_MARKET_GUIDE: Record<string, string> = {
  "Hjemmeseier (1)":    "Main → Win1",
  "Uavgjort (X)":       "Main → X",
  "Borteseier (2)":     "Main → Win2",
  "Over 1.5 mål":       "Total → Over (1.5)",
  "Under 1.5 mål":      "Total → Under (1.5)",
  "Over 3.5 mål":       "Total → Over (3.5)",
  "Under 3.5 mål":      "Total → Under (3.5)",
  "BTTS Ja":            "Both Teams to Score → Yes",
  "BTTS Nei":           "Both Teams to Score → No",
  "Double Chance 1X":   "Double Chance → 1X",
  "Double Chance X2":   "Double Chance → X2",
  "Double Chance 12":   "Double Chance → 12",
  "Draw No Bet Hjemme": "Draw No Bet → Hjemme",
  "Draw No Bet Borte":  "Draw No Bet → Borte",
};

const BOOKMAKER_URLS: Record<string, string> = {
  betsson: "https://www.betsson.com/nb",
  betway:  "https://www.betway.com",
};

const BOABET_SEARCH  = "https://play.1-boabet-eu.com/en/sports/sportsbook/search";
const BOABET_EVENT   = "https://play.1-boabet-eu.com/en/sports/sportsbook/event-details";
const BOABET_CHAMP   = 5106;
const BOABET_COUNTRY = 1388;

/** Normaliser lagnavn for oppslag i event-kart */
function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Direktelenke til kamp om vi har event-ID, ellers søk */
function boaBetUrl(homeTeam: string, awayTeam: string, eventMap: Map<string, number>): string {
  const key = `${normalizeTeam(homeTeam)}|${normalizeTeam(awayTeam)}`;
  const id  = eventMap.get(key);
  if (id) {
    const p = new URLSearchParams({
      champ:    String(BOABET_CHAMP),
      country:  String(BOABET_COUNTRY),
      event:    String(id),
      live:     "0",
      sport:    "1",
      supertip: "0",
    });
    return `${BOABET_EVENT}?${p}`;
  }
  return boaBetSearchUrl(homeTeam);
}

/** Fallback søke-URL */
function boaBetSearchUrl(homeTeam: string): string {
  const SKIP = new Set(["oslo", "bergen", "city", "town", "united"]);
  const words = homeTeam.split(/[\s/]+/);
  const best  = words.find(w => w.length >= 4 && !SKIP.has(w.toLowerCase()))
             ?? words[0]
             ?? homeTeam;
  return `${BOABET_SEARCH}?q=${encodeURIComponent(best)}`;
}

/** Visningstekst for søkeordet (brukes kun når direktelenke mangler) */
function boaBetSearchTerm(homeTeam: string): string {
  const SKIP = new Set(["oslo", "bergen", "city", "town", "united"]);
  const words = homeTeam.split(/[\s/]+/);
  return words.find(w => w.length >= 4 && !SKIP.has(w.toLowerCase()))
      ?? words[0]
      ?? homeTeam;
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  if (isToday)    return `I dag ${time}`;
  if (isTomorrow) return `I morgen ${time}`;
  return d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" }) + ` ${time}`;
}

function edgeColor(pct: number) {
  if (pct >= 10) return "text-green-300 font-bold";
  if (pct >= 7)  return "text-green-400";
  return "text-yellow-400";
}

function rankBadge(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `#${i + 1}`;
}

export default function DagensTips({ bankroll, sport = "eliteserien" }: { bankroll: number; sport?: string }) {
  const [bets, setBets]           = useState<DagensTipsBet[]>([]);
  const [loading, setLoading]     = useState(true);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [error, setError]         = useState(false);
  const [expanded, setExpanded]   = useState(true);
  // Map: "home team|away team" (lowercase) → DDI Frame event ID
  const [eventMap, setEventMap]   = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Hent scan og event-IDs parallelt
      const [scanRes, ddiRes] = await Promise.allSettled([
        fetch(`/api/scan?sport=${sport}`),
        fetch("/api/ddi-events"),
      ]);

      if (scanRes.status === "fulfilled" && scanRes.value.ok) {
        const data = await scanRes.value.json();
        setBets(data.bets ?? []);
        setScannedAt(data.scannedAt ?? null);
      } else {
        setError(true);
      }

      if (ddiRes.status === "fulfilled" && ddiRes.value.ok) {
        const ddi = await ddiRes.value.json();
        if (Array.isArray(ddi.events) && ddi.events.length > 0) {
          const map = new Map<string, number>();
          for (const ev of ddi.events as { key: string; id: number }[]) {
            map.set(ev.key, ev.id);
          }
          setEventMap(map);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => { load(); }, [load]);

  // Vis komprimert header hvis ingen tips
  const totalEV = bets.reduce((s, b) => s + b.evNOK, 0);

  return (
    <div className="rounded-xl border border-[#2a2d3a] bg-[#12151f] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3
          hover:bg-[#1a1d27] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🎯</span>
          <div>
            <span className="font-bold text-white text-sm">Dagens tips</span>
            <span className="ml-2 text-xs text-[#64748b]">
            {sport === "premierleague"
              ? "— Pinnacle-kalibrert + Poisson"
              : "— Poisson-scan av alle kamper"}
          </span>
          </div>
          {!loading && bets.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-900 text-green-300 text-xs font-bold">
              {bets.length} value bet{bets.length !== 1 ? "s" : ""}
            </span>
          )}
          {!loading && bets.length === 0 && !error && (
            <span className="px-2 py-0.5 rounded-full bg-[#1e293b] text-[#64748b] text-xs">
              Ingen tips i dag
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!loading && bets.length > 0 && (
            <span className="text-xs text-[#64748b]">
              Total EV:{" "}
              <span className={totalEV >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                {totalEV >= 0 ? "+" : ""}{totalEV} kr
              </span>
            </span>
          )}
          <span className="text-[#64748b] text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* ── Innhold ────────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-[#2a2d3a]">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg bg-[#1a1d27] animate-pulse" />
              ))}
              <p className="text-xs text-center text-[#64748b] pt-1">
                Skanner alle Eliteserien-kamper med Poisson-modellen…
              </p>
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">Klarte ikke hente tips. Sjekk ODDS_API_KEY.</p>
              <button onClick={load} className="mt-2 text-xs text-[#64748b] hover:text-white underline">
                Prøv igjen
              </button>
            </div>
          ) : bets.length === 0 ? (
            <div className="p-5 text-center space-y-2">
              <p className="text-3xl">🔍</p>
              <p className="text-sm text-[#cbd5e1] font-medium">
                Ingen value bets funnet akkurat nå
              </p>
              <p className="text-xs text-[#64748b] max-w-sm mx-auto leading-relaxed">
                Modellen krever ≥5 % relativ edge OG ≥3 pp absolutt fordel for å anbefale et bet.
                De beste mulighetene dukker opp nærmere kampstart.
              </p>
              <button
                onClick={load}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-[#2a2d3a]
                  text-[#64748b] hover:text-white hover:border-[#3a4060] transition-colors"
              >
                🔄 Skann på nytt
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#1e2235]">
              {bets.map((bet, i) => (
                <div
                  key={`${bet.homeTeam}-${bet.awayTeam}-${bet.market}`}
                  className={`px-4 py-3 flex items-center gap-3
                    ${i === 0 ? "bg-[#0d1a0f]" : "hover:bg-[#14172a]"} transition-colors`}
                >
                  {/* Rang */}
                  <span className="text-base w-7 text-center flex-shrink-0 select-none">
                    {rankBadge(i)}
                  </span>

                  {/* Kamp + marked */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {bet.homeTeam} – {bet.awayTeam}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e2235] text-[#94a3b8] whitespace-nowrap">
                        {bet.market}
                      </span>
                      {BOABET_MARKET_GUIDE[bet.market] && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a2a1a] text-green-400 whitespace-nowrap">
                          🦁 {BOABET_MARKET_GUIDE[bet.market]}
                        </span>
                      )}
                      {bet.pinnacleRef && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1a1a2e] text-blue-400 whitespace-nowrap"
                          title="Sannsynlighet basert på Pinnacle (verdens skarpeste bookmaker)">
                          📌 Pinnacle-ref
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[#64748b] flex-wrap">
                      <span>{formatKickoff(bet.commenceTime)}</span>
                      <span>·</span>
                      <span>
                        Odds{" "}
                        <span className="text-white font-mono font-bold">{bet.odds.toFixed(2)}</span>
                        {" "}hos{" "}
                        <span className="text-white">{BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker}</span>
                      </span>
                      <span>·</span>
                      <span>
                        Vår prob{" "}
                        <span className="text-white font-mono">{(bet.ourProb * 100).toFixed(0)}%</span>
                        {" vs "}
                        <span className="font-mono">{(bet.impliedProb * 100).toFixed(0)}%</span>
                        {" implisitt"}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 flex-shrink-0 text-right">
                    <div className="hidden sm:block text-xs text-[#64748b]">
                      <p>Innsats</p>
                      <p className="text-white font-mono font-bold">{bet.stake} kr</p>
                    </div>
                    <div className="hidden sm:block text-xs text-[#64748b]">
                      <p>EV</p>
                      <p className="text-green-400 font-mono font-bold">+{bet.evNOK} kr</p>
                    </div>
                    <div className="text-xs">
                      <p className="text-[#64748b]">Edge</p>
                      <p className={edgeColor(bet.edgePct)}>+{bet.edgePct}%</p>
                    </div>
                    {(() => {
                      const boaHref   = boaBetUrl(bet.homeTeam, bet.awayTeam, eventMap);
                      const isDirect  = boaHref.includes("event-details");
                      const bkUrl     = BOOKMAKER_URLS[bet.bookmaker];
                      const bkName    = BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker;
                      const term      = boaBetSearchTerm(bet.homeTeam);
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <a
                            href={boaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-3 py-1.5 rounded-lg text-white text-xs font-semibold
                              transition-colors whitespace-nowrap
                              ${isDirect
                                ? "bg-green-700 hover:bg-green-600"
                                : "bg-amber-600 hover:bg-amber-500"}`}
                            title={isDirect
                              ? "Direktelenke til kampen på BoaBet"
                              : `Åpner BoaBet-søk for «${term}» — klikk kampen for å bette`}
                          >
                            🦁 {isDirect ? "Gå til kamp ↗" : "Finn kamp ↗"}
                          </a>
                          {bkUrl && (
                            <a
                              href={bkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded text-[10px] border border-[#2a2d3a]
                                text-[#94a3b8] hover:text-white hover:border-[#3a4060] transition-colors whitespace-nowrap"
                              title={`Ref-odds ${bet.odds.toFixed(2)} hos ${bkName}`}
                            >
                              {bkName} {bet.odds.toFixed(2)} ↗
                            </a>
                          )}
                          {!isDirect && (
                            <span className="text-[10px] text-amber-500/80 whitespace-nowrap">
                              Søk: «{term}»
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div className="px-4 py-3 flex items-center justify-between bg-[#0d0f19]">
                <p className="text-xs text-[#3a4060]">
                  {scannedAt
                    ? `Skannet: ${new Date(scannedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                  {" · Kun Poisson-modell, ingen AI"}
                </p>
                <button
                  onClick={load}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded border border-[#2a2d3a]
                    text-[#64748b] hover:text-white hover:border-[#3a4060]
                    transition-colors disabled:opacity-40"
                >
                  🔄 Oppdater
                </button>
              </div>
            </div>
          )}

          {/* Forklaring på terskler */}
          {!loading && bets.length > 0 && (
            <div className="px-4 pb-3 pt-1">
              <p className="text-xs text-[#3a4060] leading-relaxed">
                💡 Terskler: ≥5 % relativ edge + ≥3 pp absolutt fordel + Kelly-stake ≥100 kr.
                Åpne en kamp for full AI-analyse med skadeinfo, H2H og kontekst.
                Bankroll: {bankroll.toLocaleString("nb-NO")} kr
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
