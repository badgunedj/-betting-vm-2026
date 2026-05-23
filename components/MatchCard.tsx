"use client";
import { useState, useEffect } from "react";
import { MatchAnalysis, BetSuggestion } from "@/lib/analyze";
import { MatchOdds } from "@/lib/odds-api";
import {
  saveAnalysis,
  loadAnalysis,
  deleteAnalysis,
  makeMatchKey,
} from "@/lib/analysis-store";
import { MAX_BOOKMAKER_MARGIN } from "@/lib/odds-api";
import { getDrawdownStatus, DrawdownStatus } from "@/lib/drawdown";
import { saveCLVBaseline, updateCLVRefresh, getCLVEntries } from "@/lib/clv-store";
import { addPendingBet, getBetResults } from "@/lib/result-store";

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  date: string;
  sport: string;
  bankroll: number;
  preloadedOdds?: MatchOdds | null;
}

// BoaBet URL-struktur (fra devtools):
//   Kamp-side:  /event-details?champ=5106&country=1388&event=EVENT_ID&live=0&sport=1&supertip=0
//   NB: SPA prosesserer ikke champ/country-params via ekstern navigasjon — kun event-ID fungerer
const BOABET_EVENT_BASE = "https://play.1-boabet-eu.com/en/sports/sportsbook/event-details";
const BOABET_HOME       = "https://play.1-boabet-eu.com/en/sports/sportsbook/";
// champ=5106 = Eliteserien 2026 · country=1388 = Norge · sport=1 = fotball
function boaBetUrl(sport: string, eventId?: number | null): string {
  if (sport === "eliteserien" || sport === "soccer_norway_eliteserien") {
    if (eventId) {
      return `${BOABET_EVENT_BASE}?champ=5106&country=1388&event=${eventId}&live=0&sport=1&supertip=0`;
    }
  }
  // Fallback: plain sportsbook home — SPA-ens pre-match-side håndterer ikke URL-params eksternt
  return BOABET_HOME;
}

const BOOKMAKER_LINKS: Record<string, string> = {
  nordicbet: "https://www.nordicbet.com",
  betsson:   "https://www.betsson.com/nb",
  betway:    "https://www.betway.com",
  pinnacle:  "https://www.pinnacle.com",
  boabet:    BOABET_HOME,
};

const BOOKMAKER_NAMES: Record<string, string> = {
  nordicbet: "NordicBet",
  betsson:   "Betsson",
  betway:    "Betway",
  pinnacle:  "Pinnacle",
  boabet:    "BoaBet",
};

// ── BoaBet odds-sjekk ────────────────────────────────────────────────────────
// Beregn edge med BoaBet sine faktiske odds (tastet inn manuelt)
function calcBoaBetEdge(ourProbability: number, oddsStr: string) {
  const o = parseFloat(oddsStr.replace(",", "."));
  if (isNaN(o) || o <= 1) return null;
  const impliedProb = 1 / o;
  const relEdge     = (ourProbability - impliedProb) / impliedProb;
  const absEdge     = ourProbability - impliedProb;
  return { relEdge, absEdge, boaOdds: o };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function FormDots({ form }: { form: string }) {
  return (
    <div className="flex gap-1">
      {form.slice(-5).split("").map((c, i) => (
        <span
          key={i}
          className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold
            ${c === "W" ? "bg-green-500 text-white" :
              c === "D" ? "bg-yellow-500 text-black" :
              "bg-red-500 text-white"}`}
        >
          {c === "W" ? "V" : c === "D" ? "U" : "T"}
        </span>
      ))}
    </div>
  );
}

export default function MatchCard({
  homeTeam, awayTeam, homeTeamId, awayTeamId,
  leagueId, leagueName, date, sport, bankroll, preloadedOdds,
}: Props) {
  const matchKey = makeMatchKey(homeTeam, awayTeam, date);

  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [odds, setOdds] = useState<MatchOdds | null>(preloadedOdds ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [drawdown, setDrawdown] = useState<DrawdownStatus | null>(null);
  const [loggedBetIds, setLoggedBetIds] = useState<Set<string>>(new Set());
  // market → CLV% (positiv = odds shortet = sharps inne, negativ = driftet)
  const [movementMap, setMovementMap] = useState<Map<string, number>>(new Map());
  // market → BoaBet-odds (manuelt tastet inn av bruker for edge-sammenligning)
  const [boaBetOdds, setBoaBetOdds] = useState<Record<string, string>>({});

  // Last inn lagret analyse ved oppstart
  useEffect(() => {
    const saved = loadAnalysis(matchKey);
    if (saved) {
      setAnalysis(saved.analysis);
      if (saved.odds) setOdds(saved.odds);
      setFromCache(true);
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey]);

  // Drawdown-status (client-only — localStorage)
  useEffect(() => {
    setDrawdown(getDrawdownStatus(bankroll));
  }, [bankroll]);

  // Sync logged bets + odds movement fra localStorage (begge client-only)
  useEffect(() => {
    setLoggedBetIds(new Set(getBetResults().map(r => r.id)));
    // CLV-entries for denne kampen: positiv clvPct = shortet = bullish
    const mvMap = new Map<string, number>();
    for (const e of getCLVEntries()) {
      if (e.matchKey === matchKey && e.clvPct !== null) {
        mvMap.set(e.market, e.clvPct);
      }
    }
    setMovementMap(mvMap);
  }, [analysis, matchKey]);

  // Last inn lagrede BoaBet-odds fra localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`bettingbot_boabet_${matchKey}`);
      if (stored) setBoaBetOdds(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [matchKey]);

  const updateBoaBetOdds = (market: string, value: string) => {
    const updated = { ...boaBetOdds, [market]: value };
    setBoaBetOdds(updated);
    localStorage.setItem(`bettingbot_boabet_${matchKey}`, JSON.stringify(updated));
  };

  async function runAnalysis(forceRefresh = false) {
    // Bruk cache hvis tilgjengelig og ikke tvungen oppdatering
    if (!forceRefresh) {
      const saved = loadAnalysis(matchKey);
      if (saved) {
        setAnalysis(saved.analysis);
        if (saved.odds) setOdds(saved.odds);
        setFromCache(true);
        setOpen(true);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeam, awayTeam, bankroll,
          odds: preloadedOdds,
          commenceTime: date,
          sport,
          kellyFraction: drawdown?.kellyFraction ?? 0.25,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Feil");
      setAnalysis(data.analysis);
      setOdds(data.odds);
      setFromCache(false);
      setOpen(true);

      // Lagre til localStorage
      saveAnalysis({
        key: matchKey,
        homeTeam,
        awayTeam,
        date,
        sport,
        analysis: data.analysis,
        odds: data.odds ?? null,
        savedAt: new Date().toISOString(),
      });

      // CLV-tracking: baseline ved første analyse, refresh-oppdatering ved tvungen ny
      if (!forceRefresh) {
        saveCLVBaseline(
          data.analysis.bets.map((bet: BetSuggestion) => ({
            matchKey,
            homeTeam,
            awayTeam,
            matchDate: date,
            market: bet.market,
            bookmaker: bet.bookmaker,
            oddsAtAnalysis: bet.odds,
            savedAt: new Date().toISOString(),
          }))
        );
      } else {
        // Refresh → oppdater CLV med nye odds (closing proxy)
        data.analysis.bets.forEach((bet: BetSuggestion) => {
          updateCLVRefresh(matchKey, bet.market, bet.odds);
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  function logBet(bet: BetSuggestion) {
    addPendingBet({
      matchKey,
      homeTeam,
      awayTeam,
      matchDate: date,
      market: bet.market,
      bookmaker: bet.bookmaker,
      odds: bet.odds,
      stake: bet.recommendedStake,
      ourProbability: bet.ourProbability,
      valueEdgePct: bet.valueEdgePct,
      evNOK: bet.evNOK,
    });
    setLoggedBetIds(prev => new Set([...prev, `${matchKey}_${bet.market}`]));
  }

  return (
    <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[#1e293b] text-blue-400">
            {leagueName}
          </span>
          <span className="text-xs text-[#64748b]">{formatDate(date)}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-bold text-lg flex-1 text-right">{homeTeam}</span>
          <span className="text-[#64748b] text-sm font-medium px-2">vs</span>
          <span className="font-bold text-lg flex-1">{awayTeam}</span>
        </div>

        <div className="mt-4 flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(!open)}
              className="text-xs text-[#64748b] hover:text-white transition-colors"
            >
              {open ? "▲ Lukk" : "▼ Detaljer"}
            </button>
            {fromCache && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 font-semibold">
                💾 Lagret
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {fromCache && (
              <>
                <button
                  onClick={() => {
                    deleteAnalysis(matchKey);
                    setAnalysis(null);
                    setFromCache(false);
                    setOpen(false);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-all
                    border border-red-800 text-red-400 hover:bg-red-950"
                  title="Slett lagret analyse"
                >
                  🗑
                </button>
                <button
                  onClick={() => runAnalysis(true)}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-all
                    border border-[#2a2d3a] text-[#64748b] hover:text-white disabled:opacity-50"
                >
                  {loading ? "..." : "🔄"}
                </button>
              </>
            )}
            <button
              onClick={() => runAnalysis(false)}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all
                bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
            >
              {loading ? "Analyserer..." : fromCache ? "📊 Vis analyse" : "⚡ Analyser kamp"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Odds tabell (vises alltid når open) */}
      {open && odds && (
        <div className="border-t border-[#2a2d3a] p-4">
          <p className="text-xs text-[#64748b] mb-3 uppercase tracking-wider">Live odds</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#64748b] text-xs">
                  <th className="text-left pb-2">Bookmaker</th>
                  <th className="text-center pb-2">1 (Hjemme)</th>
                  <th className="text-center pb-2">X</th>
                  <th className="text-center pb-2">2 (Borte)</th>
                  <th className="text-center pb-2">O2.5</th>
                  <th className="text-center pb-2">BTTS Ja</th>
                  <th className="text-center pb-2">BTTS Nei</th>
                  <th className="text-center pb-2">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3a]">
                {odds.bookmakers.map((bk) => {
                  const isPinnacle = bk.bookmaker === "pinnacle";
                  return (
                    <tr
                      key={bk.bookmaker}
                      className={`transition-colors ${isPinnacle ? "bg-[#1a1a2e] border-l-2 border-blue-500" : "hover:bg-[#1e293b]"}`}
                    >
                      <td className="py-2 font-medium">
                        <span>{BOOKMAKER_NAMES[bk.bookmaker] ?? bk.bookmaker}</span>
                        {isPinnacle && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 font-bold">
                            📌 Referanse
                          </span>
                        )}
                      </td>
                      <td className={`text-center py-2 font-mono ${bk.homeWin === odds.bestHomeWin.odds && !isPinnacle ? "text-green-400 font-bold" : isPinnacle ? "text-blue-300" : ""}`}>
                        {bk.homeWin.toFixed(2)}
                      </td>
                      <td className={`text-center py-2 font-mono ${bk.draw === odds.bestDraw.odds && !isPinnacle ? "text-green-400 font-bold" : isPinnacle ? "text-blue-300" : ""}`}>
                        {bk.draw > 0 ? bk.draw.toFixed(2) : "-"}
                      </td>
                      <td className={`text-center py-2 font-mono ${bk.awayWin === odds.bestAwayWin.odds && !isPinnacle ? "text-green-400 font-bold" : isPinnacle ? "text-blue-300" : ""}`}>
                        {bk.awayWin.toFixed(2)}
                      </td>
                      <td className={`text-center py-2 font-mono ${bk.over25 === odds.bestOver25?.odds && !isPinnacle ? "text-green-400 font-bold" : isPinnacle ? "text-blue-300" : ""}`}>
                        {bk.over25 ? bk.over25.toFixed(2) : "-"}
                      </td>
                      <td className={`text-center py-2 font-mono ${isPinnacle ? "text-blue-300" : "text-[#94a3b8]"}`}>
                        {bk.bttsYes ? bk.bttsYes.toFixed(2) : "-"}
                      </td>
                      <td className={`text-center py-2 font-mono ${isPinnacle ? "text-blue-300" : "text-[#94a3b8]"}`}>
                        {bk.bttsNo ? bk.bttsNo.toFixed(2) : "-"}
                      </td>
                      <td className={`text-center py-2 font-mono text-xs font-semibold
                        ${isPinnacle
                          ? "text-blue-300"
                          : bk.margin > MAX_BOOKMAKER_MARGIN
                            ? "text-red-400"
                            : bk.margin > 0.06
                              ? "text-yellow-400"
                              : "text-green-400"}`}>
                        {(bk.margin * 100).toFixed(1)}%
                        {!isPinnacle && bk.margin > MAX_BOOKMAKER_MARGIN && (
                          <span className="ml-1" title="For høy margin — ignoreres som bet-mål">⛔</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pinnacle sannsynligheter (margin fjernet) */}
          {odds.pinnacleRef && (
            <div className="mt-3 p-3 rounded-lg bg-[#0d1225] border border-blue-900">
              <p className="text-xs text-blue-400 font-semibold mb-1">
                📌 Pinnacle "sann" sannsynlighet (margin {(odds.pinnacleRef.margin * 100).toFixed(1)}% fjernet)
              </p>
              <div className="flex gap-4 text-xs font-mono">
                <span className="text-white">1: <span className="text-blue-300">{(odds.pinnacleRef.homeProb * 100).toFixed(1)}%</span></span>
                <span className="text-white">X: <span className="text-blue-300">{(odds.pinnacleRef.drawProb * 100).toFixed(1)}%</span></span>
                <span className="text-white">2: <span className="text-blue-300">{(odds.pinnacleRef.awayProb * 100).toFixed(1)}%</span></span>
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                Brukes internt som referanse — kan ikke bettes på fra Norge
              </p>
            </div>
          )}

          {/* Asian Handicap — kompakt info under odds-tabellen */}
          {odds.ahLine !== null && (odds.bestAhHome || odds.bestAhAway) && (
            <div className="mt-3 p-3 rounded-lg bg-[#0f1a1f] border border-[#1e3a4a]">
              <p className="text-xs text-cyan-400 font-semibold mb-1">
                ⚖️ Asian Handicap — linje {odds.ahLine > 0 ? "+" : ""}{odds.ahLine} (hjemme)
              </p>
              <div className="flex gap-4 text-xs font-mono">
                {odds.bestAhHome && (
                  <span className="text-white">
                    Hjemme{" "}
                    <span className="text-cyan-300 font-bold">{odds.bestAhHome.odds.toFixed(2)}</span>
                    <span className="text-[#64748b] ml-1">({BOOKMAKER_NAMES[odds.bestAhHome.bookmaker] ?? odds.bestAhHome.bookmaker})</span>
                  </span>
                )}
                {odds.bestAhAway && (
                  <span className="text-white">
                    Borte{" "}
                    <span className="text-cyan-300 font-bold">{odds.bestAhAway.odds.toFixed(2)}</span>
                    <span className="text-[#64748b] ml-1">({BOOKMAKER_NAMES[odds.bestAhAway.bookmaker] ?? odds.bestAhAway.bookmaker})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748b] mt-1">
                Ingen uavgjort-risiko · Edge beregnes mot Poisson score-matrise
              </p>
            </div>
          )}

          <p className="text-xs text-green-400 mt-2">↑ Grønt = beste odds du kan bette på</p>
          <p className="text-xs text-[#64748b] mt-1">
            Margin: <span className="text-green-400">grønn ≤6%</span> · <span className="text-yellow-400">gul 6–8%</span> · <span className="text-red-400">rød &gt;8% ⛔ ignoreres som bet-mål</span>
          </p>
        </div>
      )}

      {/* AI Analyse */}
      {open && analysis && (
        <div className="border-t border-[#2a2d3a] p-4 space-y-4">
          {/* Sammendrag */}
          <div>
            <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">AI Analyse</p>
            <p className="text-sm text-[#cbd5e1] leading-relaxed">{analysis.summary}</p>
          </div>

          {/* Nøkkelfaktorer */}
          {analysis.keyFactors.length > 0 && (
            <div>
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">Nøkkelfaktorer</p>
              <ul className="space-y-1">
                {analysis.keyFactors.map((f, i) => (
                  <li key={i} className="text-sm text-[#cbd5e1] flex gap-2">
                    <span className="text-yellow-400">•</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drawdown-banner */}
          {drawdown && drawdown.mode !== "normal" && (
            <div className={`rounded-lg p-3 text-sm font-medium border
              ${drawdown.mode === "danger"
                ? "bg-red-950 border-red-700 text-red-300"
                : "bg-yellow-950 border-yellow-700 text-yellow-300"}`}>
              {drawdown.message}
              <span className="ml-2 text-xs opacity-70">
                (topp: {drawdown.peakBankroll.toLocaleString("nb-NO")} kr → nå: {drawdown.currentBankroll.toLocaleString("nb-NO")} kr)
              </span>
            </div>
          )}

          {/* Betsforslag */}
          {analysis.bets.length > 0 ? (
            <div>
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-3">
                Betsforslag ({analysis.bets.length})
                {drawdown && drawdown.mode !== "normal" && (
                  <span className="ml-2 font-semibold text-yellow-400">
                    · {(drawdown.kellyFraction * 100).toFixed(0)}% Kelly aktiv
                  </span>
                )}
              </p>
              <div className="space-y-3">
                {analysis.bets.map((bet, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[#2a2d3a] bg-[#0f1117] p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{bet.market}</span>
                        <span className={
                          bet.confidence === "HØY"
                            ? "text-xs px-2 py-0.5 rounded-full bg-green-950 text-green-400 font-bold"
                            : bet.confidence === "MEDIUM"
                            ? "text-xs px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-400 font-bold"
                            : "text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold"
                        }>
                          {bet.confidence}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className="text-green-400 font-bold text-sm">
                          +{bet.valueEdgePct}% edge
                        </span>
                        {bet.evNOK > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-950 text-green-300 font-mono">
                            EV +{bet.evNOK} kr
                          </span>
                        )}
                        {/* Odds movement — bare synlig etter en 🔄 refresh */}
                        {(() => {
                          const mv = movementMap.get(bet.market);
                          if (mv === undefined || Math.abs(mv) < 2) return null;
                          const shorten = mv > 0; // positiv CLV = odds kortet
                          return (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                shorten
                                  ? mv >= 5
                                    ? "bg-green-950 text-green-300"
                                    : "bg-yellow-950 text-yellow-300"
                                  : "bg-red-950 text-red-300"
                              }`}
                              title={shorten
                                ? "Odds har kortet siden analyse — sharp-money bekrefter bettet"
                                : "Odds har driftet — markedet er skeptisk til dette bettet"}
                            >
                              {shorten
                                ? `📉 Shortet ${mv.toFixed(1)}%`
                                : `📈 Driftet ${Math.abs(mv).toFixed(1)}%`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-xs text-[#64748b] mb-3">
                      <div>
                        <p>Odds</p>
                        <p className="text-white font-mono font-bold text-base">{bet.odds.toFixed(2)}</p>
                      </div>
                      <div>
                        <p>Vår prob.</p>
                        <p className="text-white font-mono">{(bet.ourProbability * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p>Anbefalt innsats</p>
                        <p className="text-white font-mono font-bold">{bet.recommendedStake} kr</p>
                      </div>
                      <div>
                        <p>Forventet gevinst</p>
                        <p className={`font-mono font-bold ${bet.evNOK >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {bet.evNOK >= 0 ? "+" : ""}{bet.evNOK} kr
                        </p>
                      </div>
                    </div>

                    {/* BoaBet-sammenligning */}
                    {(() => {
                      const bResult = calcBoaBetEdge(
                        bet.ourProbability,
                        boaBetOdds[bet.market] ?? ""
                      );
                      const hasFullValue  = bResult && bResult.relEdge >= 0.05 && bResult.absEdge >= 0.03;
                      const hasPartialValue = bResult && bResult.relEdge > 0;
                      return (
                        <div className="flex items-center gap-2 mb-3 pt-2 border-t border-[#1e2235]">
                          <a
                            href="https://play.1-boabet-eu.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber-400 font-semibold whitespace-nowrap
                              hover:text-amber-300 transition-colors"
                            title="Åpne BoaBet"
                          >
                            🦁 BoaBet:
                          </a>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={`ref ${bet.odds.toFixed(2)}`}
                            value={boaBetOdds[bet.market] ?? ""}
                            onChange={e => updateBoaBetOdds(bet.market, e.target.value)}
                            className="w-24 bg-[#0d0f19] border border-[#2a2d3a] rounded px-2 py-1
                              text-sm text-white font-mono placeholder-[#3a4060]
                              focus:outline-none focus:border-amber-500 transition-colors"
                          />
                          {bResult ? (
                            <span className={`text-xs px-2 py-1 rounded font-semibold font-mono flex-1 text-center ${
                              hasFullValue
                                ? "bg-green-950 text-green-300 border border-green-800"
                                : hasPartialValue
                                ? "bg-yellow-950 text-yellow-300 border border-yellow-800"
                                : "bg-red-950 text-red-300 border border-red-800"
                            }`}>
                              {hasFullValue ? "✅" : hasPartialValue ? "⚠️" : "❌"}{" "}
                              {bResult.relEdge > 0 ? "+" : ""}
                              {(bResult.relEdge * 100).toFixed(1)}% edge
                              {bResult.boaOdds > bet.odds
                                ? " · 🔼 bedre enn ref"
                                : bResult.boaOdds < bet.odds
                                ? " · 🔽 dårligere enn ref"
                                : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-[#3a4060] flex-1">
                              tast inn BoaBet-odds for å sjekke edge
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex gap-2">
                      {/* Primærknapp: BoaBet med liga-deep-link */}
                      <a
                        href={boaBetUrl(sport)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center py-2 rounded-lg bg-amber-600 hover:bg-amber-500
                          text-white text-sm font-semibold transition-colors"
                        title={`Ref-odds: ${bet.odds.toFixed(2)} hos ${BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker}`}
                      >
                        🦁 Bet på BoaBet →
                      </a>
                      {/* Sekundær: direkte lenke til den anbefalte bookmaker (kun info) */}
                      {bet.bookmaker !== "boabet" && (
                        <a
                          href={BOOKMAKER_LINKS[bet.bookmaker] ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-lg border border-[#2a2d3a] text-[#64748b]
                            hover:text-white hover:border-[#3a4060] text-xs font-semibold
                            transition-colors whitespace-nowrap"
                          title={`Sjekk ref-odds ${bet.odds.toFixed(2)} hos ${BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker}`}
                        >
                          {BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker} ↗
                        </a>
                      )}
                      {loggedBetIds.has(`${matchKey}_${bet.market}`) ? (
                        <div className="px-3 py-2 rounded-lg bg-green-950 border border-green-800
                          text-green-400 text-sm font-semibold whitespace-nowrap"
                          title="Logget som pending">
                          ✅ Logget
                        </div>
                      ) : (
                        <button
                          onClick={() => logBet(bet)}
                          className="px-3 py-2 rounded-lg border border-[#2a2d3a] text-[#64748b]
                            hover:text-white hover:border-purple-700 hover:bg-purple-950
                            text-sm font-semibold transition-colors whitespace-nowrap"
                          title="Logg dette bettet som pending — oppdater utfallet i Historikk"
                        >
                          📝 Logg
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-[#0f1117] p-4 text-center">
              <p className="text-[#64748b] text-sm">
                Ingen klare value-bets funnet for denne kampen.
              </p>
            </div>
          )}

          <p className="text-xs text-[#64748b]">
            {fromCache ? "💾 Lagret analyse — " : "⚡ Analysert: "}
            {new Date(analysis.generatedAt).toLocaleString("nb-NO")}
            {fromCache && " · Trykk 🔄 for fersk analyse"}
          </p>
        </div>
      )}
    </div>
  );
}
