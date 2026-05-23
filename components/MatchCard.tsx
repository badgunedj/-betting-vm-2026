"use client";
import { useState } from "react";
import { MatchAnalysis } from "@/lib/analyze";
import { MatchOdds } from "@/lib/odds-api";

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

const BOOKMAKER_LINKS: Record<string, string> = {
  nordicbet: "https://www.nordicbet.com",
  betsson:   "https://www.betsson.com/nb",
  betway:    "https://www.betway.com",
  pinnacle:  "https://www.pinnacle.com",
  // Anbefalte norske alternativer (ikke i odds-API men gode for å plassere bet)
  boabet:    "https://www.boabet.com",
};

const BOOKMAKER_NAMES: Record<string, string> = {
  nordicbet: "NordicBet",
  betsson:   "Betsson",
  betway:    "Betway",
  pinnacle:  "Pinnacle",
  boabet:    "BoaBet",
};

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
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [odds, setOdds] = useState<MatchOdds | null>(preloadedOdds ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeam, awayTeam, bankroll,
          odds: preloadedOdds,
          commenceTime: date,   // for værvarsling
          sport,                // for å velge riktige datakilder
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Feil");
      setAnalysis(data.analysis);
      setOdds(data.odds);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt");
    } finally {
      setLoading(false);
    }
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

        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-[#64748b] hover:text-white transition-colors"
          >
            {open ? "▲ Lukk" : "▼ Detaljer"}
          </button>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all
              bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            {loading ? "Analyserer..." : "⚡ Analyser kamp"}
          </button>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3a]">
                {odds.bookmakers.map((bk) => (
                  <tr key={bk.bookmaker} className="hover:bg-[#1e293b] transition-colors">
                    <td className="py-2 font-medium">
                      {BOOKMAKER_NAMES[bk.bookmaker] ?? bk.bookmaker}
                    </td>
                    <td className={`text-center py-2 font-mono ${bk.homeWin === odds.bestHomeWin.odds ? "text-green-400 font-bold" : ""}`}>
                      {bk.homeWin.toFixed(2)}
                    </td>
                    <td className={`text-center py-2 font-mono ${bk.draw === odds.bestDraw.odds ? "text-green-400 font-bold" : ""}`}>
                      {bk.draw > 0 ? bk.draw.toFixed(2) : "-"}
                    </td>
                    <td className={`text-center py-2 font-mono ${bk.awayWin === odds.bestAwayWin.odds ? "text-green-400 font-bold" : ""}`}>
                      {bk.awayWin.toFixed(2)}
                    </td>
                    <td className={`text-center py-2 font-mono ${bk.over25 === odds.bestOver25?.odds ? "text-green-400 font-bold" : ""}`}>
                      {bk.over25 ? bk.over25.toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-green-400 mt-2">↑ Grønt = beste odds</p>
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

          {/* Betsforslag */}
          {analysis.bets.length > 0 ? (
            <div>
              <p className="text-xs text-[#64748b] uppercase tracking-wider mb-3">
                Betsforslag ({analysis.bets.length})
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
                      <span className="text-green-400 font-bold text-sm">
                        +{bet.valueEdgePct}% edge
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs text-[#64748b] mb-3">
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
                    </div>

                    <a
                      href={BOOKMAKER_LINKS[bet.bookmaker] ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center py-2 rounded-lg bg-green-700 hover:bg-green-600
                        text-white text-sm font-semibold transition-colors"
                    >
                      Bet på {BOOKMAKER_NAMES[bet.bookmaker] ?? bet.bookmaker} →
                    </a>
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
            Analysert: {new Date(analysis.generatedAt).toLocaleString("nb-NO")}
          </p>
        </div>
      )}
    </div>
  );
}
