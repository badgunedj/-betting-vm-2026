"use client";
import { useState, useEffect, useCallback } from "react";
import type { DagensTipsBet } from "@/app/api/scan/route";

const BOOKMAKER_NAMES: Record<string, string> = {
  nordicbet: "NordicBet",
  betsson:   "Betsson",
  betway:    "Betway",
  pinnacle:  "Pinnacle",
  boabet:    "BoaBet",
};

// BoaBet URL-struktur (fra devtools):
//   Kamp-side:  /event-details?champ=5106&country=1388&event=EVENT_ID&live=0&sport=1&supertip=0
//   Liga-side:  /pre-match?champ=5106&country=1388&sport=1&live=0
//
// champ=5106   = Eliteserien 2026-sesongen
// country=1388 = Norge
// sport=1      = fotball
const BOABET_ELITESERIEN = {
  champ:   5106,
  country: 1388,
  sport:   1,
} as const;

const BOABET_EVENT_BASE  = "https://play.1-boabet-eu.com/en/sports/sportsbook/event-details";
const BOABET_LEAGUE_BASE = "https://play.1-boabet-eu.com/en/sports/sportsbook/pre-match";

/** Fallback: åpner Eliteserien-siden på BoaBet (alle kamper synlig) */
function boaBetLeagueUrl(): string {
  const { champ, country, sport } = BOABET_ELITESERIEN;
  return `${BOABET_LEAGUE_BASE}?champ=${champ}&country=${country}&sport=${sport}&live=0`;
}

/** Presis kamp-URL hvis vi kjenner event-ID */
function boaBetEventUrl(eventId: number): string {
  const { champ, country, sport } = BOABET_ELITESERIEN;
  return `${BOABET_EVENT_BASE}?champ=${champ}&country=${country}&event=${eventId}&live=0&sport=${sport}&supertip=0`;
}

// DDI Frame partner-ID for BoaBet (fra devtools-analyse)
const DDI_PARTNER = "188a1665-3c7b-48aa-a143-6764c719955f";
const DDI_API     = `https://sport.ddiframe.com/${DDI_PARTNER}`;

/** Hent event-IDer fra DDI Frame API (klient-side — unngår Cloudflare-blokkering).
 *  Returnerer Map<"homeTeam|awayTeam" (lowercase), eventId> */
async function fetchDDIEventIds(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { champ, country, sport } = BOABET_ELITESERIEN;
  try {
    // Prøv kjente DDI Frame API-mønstre
    const endpoints = [
      `/api/events?sportId=${sport}&countryId=${country}&champId=${champ}&live=0`,
      `/api/v2/events?sportId=${sport}&countryId=${country}&champId=${champ}`,
      `/api/match/list?sport=${sport}&country=${country}&champ=${champ}`,
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${DDI_API}${ep}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        // Forsøk å parse event-IDer uavhengig av eksakt schema
        const events: unknown[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)   ? data.data
          : Array.isArray(data?.events) ? data.events
          : Array.isArray(data?.matches)? data.matches
          : [];
        for (const ev of events) {
          if (typeof ev !== "object" || ev === null) continue;
          const e = ev as Record<string, unknown>;
          const id    = Number(e.id ?? e.eventId ?? e.matchId);
          const home  = String(e.homeTeam ?? e.home ?? e.team1 ?? "").toLowerCase();
          const away  = String(e.awayTeam ?? e.away ?? e.team2 ?? "").toLowerCase();
          if (id && home && away) map.set(`${home}|${away}`, id);
        }
        if (map.size > 0) break; // funnet svar — stopp
      } catch { continue; }
    }
  } catch { /* ignore — bruker fallback */ }
  return map;
}

/** Finn best-match event-ID ved fuzzy-matching av lagnavn */
function findEventId(
  homeTeam: string,
  awayTeam: string,
  eventMap: Map<string, number>
): number | null {
  const hLow = homeTeam.toLowerCase();
  const aLow = awayTeam.toLowerCase();
  // Eksakt match
  const exact = eventMap.get(`${hLow}|${aLow}`);
  if (exact) return exact;
  // Delvis match (f.eks. "Bodø/Glimt" vs "bodo/glimt")
  for (const [key, id] of eventMap) {
    const [h, a] = key.split("|");
    if ((h.includes(hLow) || hLow.includes(h)) &&
        (a.includes(aLow) || aLow.includes(a))) return id;
  }
  return null;
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
  // DDI Frame event-IDer: "homeTeam|awayTeam" → eventId
  const [eventMap, setEventMap]   = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Hent value bets + event-IDer parallelt
      const [scanRes, ddiMap] = await Promise.all([
        fetch("/api/scan"),
        sport === "eliteserien" ? fetchDDIEventIds() : Promise.resolve(new Map<string, number>()),
      ]);
      const data = await scanRes.json();
      setBets(data.bets ?? []);
      setScannedAt(data.scannedAt ?? null);
      setEventMap(ddiMap);
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
            <span className="ml-2 text-xs text-[#64748b]">— Poisson-scan av alle kamper</span>
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
                      const eventId = findEventId(bet.homeTeam, bet.awayTeam, eventMap);
                      const href    = eventId ? boaBetEventUrl(eventId) : boaBetLeagueUrl();
                      const label   = eventId ? "🦁 Bet direkte →" : "🦁 BoaBet →";
                      const title   = eventId
                        ? `Åpner kamp-siden direkte · ref-odds ${bet.odds.toFixed(2)} (${BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker})`
                        : `Åpner Eliteserien-siden · ref-odds ${bet.odds.toFixed(2)} (${BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker})`;
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500
                              text-white text-xs font-semibold transition-colors whitespace-nowrap"
                            title={title}
                          >
                            {label}
                          </a>
                          <span className="text-[10px] text-[#64748b] whitespace-nowrap">
                            {eventId
                              ? <span className="text-green-500">✓ kamp funnet</span>
                              : "Finn kampen på siden"}
                            {" · "}{bet.odds.toFixed(2)} ref
                          </span>
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
