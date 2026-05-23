"use client";
import { useState, useEffect } from "react";
import {
  getAllAnalyses,
  deleteAnalysis,
  clearAllAnalyses,
  SavedAnalysis,
  analysisCount,
} from "@/lib/analysis-store";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function EdgeBadge({ pct }: { pct: number }) {
  const color = pct >= 10 ? "text-green-400" : pct >= 6 ? "text-yellow-400" : "text-slate-400";
  return <span className={`font-bold ${color}`}>+{pct}%</span>;
}

function ConfBadge({ c }: { c: string }) {
  if (c === "HØY") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-950 text-green-400 font-bold">HØY</span>;
  if (c === "MEDIUM") return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-400 font-bold">MEDIUM</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold">LAV</span>;
}

export default function AnalysisHistory() {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const reload = () => setAnalyses(getAllAnalyses());

  useEffect(() => { reload(); }, []);

  function handleDelete(key: string) {
    deleteAnalysis(key);
    reload();
    if (expanded === key) setExpanded(null);
  }

  function handleClearAll() {
    if (confirm(`Slette alle ${analyses.length} lagrede analyser?`)) {
      clearAllAnalyses();
      reload();
      setExpanded(null);
    }
  }

  const filtered = filter
    ? analyses.filter(a =>
        `${a.homeTeam} ${a.awayTeam}`.toLowerCase().includes(filter.toLowerCase())
      )
    : analyses;

  const withBets    = filtered.filter(a => a.analysis.bets.length > 0);
  const withoutBets = filtered.filter(a => a.analysis.bets.length === 0);

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-10 text-center">
        <p className="text-4xl mb-3">💾</p>
        <p className="text-[#64748b] text-sm">Ingen lagrede analyser ennå.</p>
        <p className="text-[#64748b] text-xs mt-1">
          Klikk «⚡ Analyser kamp» på en kamp — resultatet lagres automatisk her.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Topp-bar */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Søk lag..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="flex-1 bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-3 py-2
            text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-[#64748b] whitespace-nowrap">
          {filtered.length} / {analysisCount()} analyser
        </span>
        <button
          onClick={handleClearAll}
          className="text-xs px-3 py-2 rounded-lg border border-red-900 text-red-500
            hover:bg-red-950 transition-colors whitespace-nowrap"
        >
          🗑 Slett alle
        </button>
      </div>

      {/* Statistikk-rad */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#1a1d27] border border-[#2a2d3a] p-3 text-center">
          <p className="text-2xl font-bold text-white">{analyses.length}</p>
          <p className="text-xs text-[#64748b]">Analyser totalt</p>
        </div>
        <div className="rounded-xl bg-[#1a1d27] border border-[#2a2d3a] p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{withBets.length}</p>
          <p className="text-xs text-[#64748b]">Med value-bets</p>
        </div>
        <div className="rounded-xl bg-[#1a1d27] border border-[#2a2d3a] p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {analyses.reduce((s, a) => s + a.analysis.bets.length, 0)}
          </p>
          <p className="text-xs text-[#64748b]">Bets foreslått</p>
        </div>
      </div>

      {/* Med value-bets øverst */}
      {withBets.length > 0 && (
        <div>
          <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">
            Med value-bets ({withBets.length})
          </p>
          <div className="space-y-2">
            {withBets.map(a => (
              <AnalysisRow
                key={a.key}
                a={a}
                expanded={expanded}
                setExpanded={setExpanded}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Uten bets */}
      {withoutBets.length > 0 && (
        <div>
          <p className="text-xs text-[#64748b] uppercase tracking-wider mb-2">
            Ingen klare bets ({withoutBets.length})
          </p>
          <div className="space-y-2">
            {withoutBets.map(a => (
              <AnalysisRow
                key={a.key}
                a={a}
                expanded={expanded}
                setExpanded={setExpanded}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisRow({
  a,
  expanded,
  setExpanded,
  onDelete,
}: {
  a: SavedAnalysis;
  expanded: string | null;
  setExpanded: (k: string | null) => void;
  onDelete: (k: string) => void;
}) {
  const isOpen = expanded === a.key;
  const hasBets = a.analysis.bets.length > 0;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all
      ${hasBets ? "border-green-900 bg-[#0f1a0f]" : "border-[#2a2d3a] bg-[#1a1d27]"}`}>

      {/* Rad-header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setExpanded(isOpen ? null : a.key)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">
            {a.homeTeam} <span className="text-[#64748b]">vs</span> {a.awayTeam}
          </p>
          <p className="text-xs text-[#64748b]">{formatDate(a.savedAt)}</p>
        </div>

        <div className="flex items-center gap-2 ml-2 shrink-0">
          {hasBets ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-950 text-green-400 font-bold">
              {a.analysis.bets.length} bet{a.analysis.bets.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
              Ingen bets
            </span>
          )}
          <span className="text-[#64748b] text-xs">{isOpen ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Utvidet innhold */}
      {isOpen && (
        <div className="border-t border-[#2a2d3a] p-3 space-y-3">
          {/* Sammendrag */}
          <p className="text-sm text-[#cbd5e1] leading-relaxed">{a.analysis.summary}</p>

          {/* Nøkkelfaktorer */}
          {a.analysis.keyFactors.length > 0 && (
            <ul className="space-y-1">
              {a.analysis.keyFactors.map((f, i) => (
                <li key={i} className="text-xs text-[#cbd5e1] flex gap-2">
                  <span className="text-yellow-400">•</span> {f}
                </li>
              ))}
            </ul>
          )}

          {/* Bets */}
          {a.analysis.bets.map((bet, i) => (
            <div key={i} className="rounded-lg bg-[#0f1117] p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{bet.market}</p>
                <p className="text-xs text-[#64748b]">
                  Odds {bet.odds.toFixed(2)} · {(bet.ourProbability * 100).toFixed(0)}% · {bet.recommendedStake} kr
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ConfBadge c={bet.confidence} />
                <EdgeBadge pct={bet.valueEdgePct} />
              </div>
            </div>
          ))}

          {/* Slett-knapp */}
          <div className="flex justify-end">
            <button
              onClick={() => onDelete(a.key)}
              className="text-xs text-red-500 hover:text-red-400 transition-colors"
            >
              🗑 Slett denne analysen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
