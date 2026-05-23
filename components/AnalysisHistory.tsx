"use client";
import { useState, useEffect } from "react";
import {
  getAllAnalyses,
  deleteAnalysis,
  clearAllAnalyses,
  SavedAnalysis,
  analysisCount,
} from "@/lib/analysis-store";
import { getCLVStats, getCLVEntries, clearCLVEntries, CLVEntry } from "@/lib/clv-store";
import { getBetResults, getPnLStats, resolveBet, clearResults, BetResult, PnLStats } from "@/lib/result-store";
import { computeCalibration, CalibrationStats } from "@/lib/calibration";

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

// ── Bankroll-kurve ────────────────────────────────────────────────────────────
const LS_START_KEY = "bettingbot_start_bankroll_v1";

function BankrollChart({
  startBankroll,
  bets,
}: {
  startBankroll: number;
  bets: BetResult[];
}) {
  const resolved = [...bets]
    .filter(r => r.outcome !== "pending" && r.resolvedAt)
    .sort((a, b) => new Date(a.resolvedAt!).getTime() - new Date(b.resolvedAt!).getTime());

  if (resolved.length < 2) return null;

  // Bygg kumulativ bankroll-serie
  const series: { bankroll: number; outcome: string }[] = [];
  let bankroll = startBankroll;
  series.push({ bankroll, outcome: "start" });
  for (const r of resolved) {
    bankroll += r.profit ?? 0;
    series.push({ bankroll, outcome: r.outcome ?? "void" });
  }

  // High watermark og max drawdown
  let peak = startBankroll;
  let maxDrawdownPct = 0;
  for (const pt of series) {
    if (pt.bankroll > peak) peak = pt.bankroll;
    const dd = peak > 0 ? ((peak - pt.bankroll) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }
  const currentBankroll = series[series.length - 1].bankroll;

  // SVG-dimensjoner
  const W = 500, H = 130;
  const PAD = { top: 14, bottom: 22, left: 44, right: 14 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const yVals = series.map(p => p.bankroll);
  const minY = Math.min(...yVals, startBankroll);
  const maxY = Math.max(...yVals, startBankroll);
  const yRange = maxY - minY || 100;

  const toX = (i: number) => PAD.left + (series.length > 1 ? (i / (series.length - 1)) * plotW : 0);
  const toY = (v: number) => PAD.top + plotH - ((v - minY) / yRange) * plotH;

  const linePoints = series.map((p, i) => `${toX(i).toFixed(1)},${toY(p.bankroll).toFixed(1)}`);
  const linePath   = `M ${linePoints.join(" L ")}`;
  const refY       = toY(startBankroll);
  const lineColor  = currentBankroll >= startBankroll ? "#818cf8" : "#f87171";

  // 3 y-akse-tickmarks
  const ticks = [minY, (minY + maxY) / 2, maxY];
  const fmtKr = (v: number) => v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);

  const dotFill = (o: string) =>
    o === "won" ? "#4ade80" : o === "lost" ? "#f87171" : "#94a3b8";

  return (
    <div className="mb-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg bg-[#0d0d1a]"
        style={{ height: 130 }}
        aria-label="Bankroll-kurve"
      >
        {/* Grid + y-akse */}
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y}
                stroke="#1a1d2e" strokeWidth="1" />
              <text x={PAD.left - 4} y={y + 3.5} textAnchor="end"
                fontSize="9" fill="#475569">{fmtKr(v)}</text>
            </g>
          );
        })}

        {/* Startlinje (stiplet) */}
        <line
          x1={PAD.left} y1={refY} x2={PAD.left + plotW} y2={refY}
          stroke="#7c3aed" strokeWidth="1" strokeDasharray="4 3" opacity="0.45"
        />

        {/* Linje */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />

        {/* Prikker for hvert bet */}
        {series.map((p, i) =>
          i > 0 ? (
            <circle
              key={i}
              cx={toX(i).toFixed(1)} cy={toY(p.bankroll).toFixed(1)}
              r="3" fill={dotFill(p.outcome)} stroke="#0d0d1a" strokeWidth="1"
            />
          ) : null
        )}
      </svg>

      {/* Stats under grafen */}
      <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
        <div>
          <p className={`font-bold font-mono ${currentBankroll >= startBankroll ? "text-green-400" : "text-red-400"}`}>
            {currentBankroll.toFixed(0)} kr
          </p>
          <p className="text-[#64748b]">Bankroll nå</p>
        </div>
        <div>
          <p className="font-bold font-mono text-blue-400">{peak.toFixed(0)} kr</p>
          <p className="text-[#64748b]">Topp</p>
        </div>
        <div>
          <p className={`font-bold font-mono ${
            maxDrawdownPct > 20 ? "text-red-400" : maxDrawdownPct > 10 ? "text-orange-400" : "text-yellow-400"
          }`}>
            -{maxDrawdownPct.toFixed(1)}%
          </p>
          <p className="text-[#64748b]">Max drawdown</p>
        </div>
      </div>
    </div>
  );
}

export default function AnalysisHistory() {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [clvEntries, setCLVEntries] = useState<CLVEntry[]>([]);
  const [showCLV, setShowCLV] = useState(false);
  const [betResults, setBetResults] = useState<BetResult[]>([]);
  const [pnlStats, setPnlStats] = useState<PnLStats | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationStats | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [startBankroll, setStartBankroll] = useState(5000);
  const [editStart, setEditStart] = useState(false);

  const reload = () => {
    setAnalyses(getAllAnalyses());
    setCLVEntries(getCLVEntries());
    const results = getBetResults();
    setBetResults(results);
    setPnlStats(getPnLStats());
    setCalibration(computeCalibration());
  };

  useEffect(() => {
    reload();
    // Last startBankroll fra localStorage ved oppstart
    const stored = localStorage.getItem(LS_START_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val > 0) setStartBankroll(val);
    }
  }, []);

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
      {(() => {
        const clvStats = getCLVStats();
        const pl = pnlStats;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="rounded-xl bg-[#1a1d27] border border-[#2a2d3a] p-3 text-center">
              <p className="text-2xl font-bold text-white">{analyses.length}</p>
              <p className="text-xs text-[#64748b]">Analyser</p>
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
            {/* CLV-stat */}
            <div
              className="rounded-xl border p-3 text-center cursor-pointer transition-colors
                border-blue-900 bg-[#0d1225] hover:bg-[#111829]"
              onClick={() => setShowCLV(!showCLV)}
              title="Klikk for å se CLV-detaljer"
            >
              {clvStats.avgCLV !== null ? (
                <>
                  <p className={`text-2xl font-bold ${clvStats.avgCLV >= 0 ? "text-blue-400" : "text-red-400"}`}>
                    {clvStats.avgCLV >= 0 ? "+" : ""}{clvStats.avgCLV}%
                  </p>
                  <p className="text-xs text-[#64748b]">Snitt CLV ({clvStats.withCLV})</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-[#64748b]">—</p>
                  <p className="text-xs text-[#64748b]">CLV ({clvStats.total} logget)</p>
                </>
              )}
            </div>
            {/* P&L-stat */}
            <div
              className="rounded-xl border p-3 text-center cursor-pointer transition-colors
                border-purple-900 bg-[#0d0d20] hover:bg-[#12122a]"
              onClick={() => setShowResults(!showResults)}
              title="Klikk for å se bet-resultater og P&L"
            >
              {pl && pl.total > 0 ? (
                <>
                  <p className={`text-2xl font-bold ${pl.totalProfit >= 0 ? "text-purple-400" : "text-red-400"}`}>
                    {pl.totalProfit >= 0 ? "+" : ""}{pl.totalProfit} kr
                  </p>
                  <p className="text-xs text-[#64748b]">P&L ({pl.total} bet{pl.total !== 1 ? "s" : ""})</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-[#64748b]">—</p>
                  <p className="text-xs text-[#64748b]">P&L (0 bets)</p>
                </>
              )}
            </div>

            {/* Kalibrering-stat */}
            <div
              className="rounded-xl border p-3 text-center cursor-pointer transition-colors
                border-green-900 bg-[#0a1a0a] hover:bg-[#0d200d]"
              onClick={() => setShowCalibration(!showCalibration)}
              title="Klikk for å se Brier score og kalibrering per sannsynlighetsspenn"
            >
              {calibration && calibration.totalResolved >= 5 ? (
                <>
                  <p className={`text-2xl font-bold ${
                    (calibration.brierSkill ?? 0) > 10 ? "text-green-400"
                    : (calibration.brierSkill ?? 0) > 0  ? "text-yellow-400"
                    : "text-red-400"
                  }`}>
                    {(calibration.brierSkill ?? 0) > 0 ? "+" : ""}{calibration.brierSkill}%
                  </p>
                  <p className="text-xs text-[#64748b]">Brier skill ({calibration.totalResolved})</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-[#64748b]">—</p>
                  <p className="text-xs text-[#64748b]">
                    Kalibrering ({calibration?.totalResolved ?? 0}/5)
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* CLV-panel */}
      {showCLV && clvEntries.length > 0 && (
        <div className="rounded-xl border border-blue-900 bg-[#0d1225] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider">
              📈 CLV-logg — Closing Line Value
            </p>
            <button
              onClick={() => { clearCLVEntries(); reload(); }}
              className="text-xs text-red-500 hover:text-red-400"
            >
              🗑 Nullstill
            </button>
          </div>
          <p className="text-xs text-[#64748b] mb-3">
            Positiv CLV = du fikk bedre odds enn markedet senere → tegn på langsiktig edge.
            Refresher du en analyse, sammenlignes gamle vs nye odds automatisk.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {clvEntries.map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-[#1a2035]">
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium">{e.homeTeam} vs {e.awayTeam}</span>
                  <span className="text-[#64748b] ml-2">{e.market}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-[#94a3b8]">{e.oddsAtAnalysis.toFixed(2)}</span>
                  {e.oddsAtRefresh ? (
                    <>
                      <span className="text-[#64748b]">→</span>
                      <span className="font-mono text-[#94a3b8]">{e.oddsAtRefresh.toFixed(2)}</span>
                      <span className={`font-bold font-mono w-16 text-right ${
                        (e.clvPct ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {(e.clvPct ?? 0) >= 0 ? "+" : ""}{e.clvPct}%
                      </span>
                    </>
                  ) : (
                    <span className="text-[#64748b] font-mono w-24 text-right">venter refresh</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P&L-panel */}
      {showResults && (
        <div className="rounded-xl border border-purple-900 bg-[#0d0d20] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider">
              📊 Bet-resultater &amp; P&amp;L
            </p>
            <button
              onClick={() => { clearResults(); reload(); }}
              className="text-xs text-red-500 hover:text-red-400"
            >
              🗑 Nullstill
            </button>
          </div>

          {/* Mini-statistikk */}
          {pnlStats && pnlStats.total > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-4 text-center">
              <div className="rounded-lg bg-[#1a1d27] p-2">
                <p className="text-lg font-bold text-green-400">{pnlStats.won}</p>
                <p className="text-xs text-[#64748b]">Vant</p>
              </div>
              <div className="rounded-lg bg-[#1a1d27] p-2">
                <p className="text-lg font-bold text-red-400">{pnlStats.lost}</p>
                <p className="text-xs text-[#64748b]">Tapte</p>
              </div>
              <div className="rounded-lg bg-[#1a1d27] p-2">
                <p className={`text-lg font-bold ${pnlStats.roi !== null && pnlStats.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {pnlStats.roi !== null ? `${pnlStats.roi >= 0 ? "+" : ""}${pnlStats.roi}%` : "—"}
                </p>
                <p className="text-xs text-[#64748b]">ROI</p>
              </div>
              <div className="rounded-lg bg-[#1a1d27] p-2">
                <p className={`text-lg font-bold font-mono ${pnlStats.totalProfit >= 0 ? "text-purple-400" : "text-red-400"}`}>
                  {pnlStats.totalProfit >= 0 ? "+" : ""}{pnlStats.totalProfit}
                </p>
                <p className="text-xs text-[#64748b]">NOK</p>
              </div>
            </div>
          )}

          {/* Bankroll-kurve — vises når ≥2 bets er avgjort */}
          {betResults.filter(r => r.outcome !== "pending").length >= 2 && (
            <div className="mb-2">
              {/* Redigerbar startbankroll */}
              <div className="flex items-center gap-2 mb-2 text-xs text-[#64748b]">
                <span>Start:</span>
                {editStart ? (
                  <input
                    type="number"
                    className="w-24 bg-[#1a1d27] border border-purple-700 rounded px-2 py-0.5
                      text-white text-xs focus:outline-none"
                    value={startBankroll}
                    onChange={e => setStartBankroll(Number(e.target.value))}
                    onBlur={() => {
                      localStorage.setItem(LS_START_KEY, String(startBankroll));
                      setEditStart(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        localStorage.setItem(LS_START_KEY, String(startBankroll));
                        setEditStart(false);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    className="font-mono text-purple-400 hover:text-purple-300 underline decoration-dotted"
                    onClick={() => setEditStart(true)}
                    title="Klikk for å endre startbankroll"
                  >
                    {startBankroll.toLocaleString("nb-NO")} kr
                  </button>
                )}
                <span className="text-[#475569]">· klikk for å endre</span>
              </div>
              <BankrollChart startBankroll={startBankroll} bets={betResults} />
            </div>
          )}

          {betResults.length === 0 ? (
            <p className="text-xs text-[#64748b] text-center py-4">
              Ingen bets logget ennå. Trykk 📝 Logg på et betsforslag for å spore utfall.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {betResults.map(r => (
                <div key={r.id}
                  className="flex items-center justify-between text-xs py-2 border-b border-[#1a1a30] last:border-0">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-white font-medium truncate">
                      {r.homeTeam} vs {r.awayTeam}
                    </p>
                    <p className="text-[#64748b]">
                      {r.market} · {r.odds.toFixed(2)} · {r.stake} kr
                      {r.outcome === "pending" && (
                        <span className="ml-2 text-yellow-500">⏳ pending</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {r.outcome === "pending" ? (
                      <>
                        <button
                          onClick={() => { resolveBet(r.id, "won"); reload(); }}
                          className="px-2 py-1 rounded bg-green-900 hover:bg-green-700
                            text-green-300 font-bold transition-colors"
                          title="Vant"
                        >
                          V
                        </button>
                        <button
                          onClick={() => { resolveBet(r.id, "lost"); reload(); }}
                          className="px-2 py-1 rounded bg-red-900 hover:bg-red-700
                            text-red-300 font-bold transition-colors"
                          title="Tapte"
                        >
                          T
                        </button>
                        <button
                          onClick={() => { resolveBet(r.id, "void"); reload(); }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700
                            text-slate-300 transition-colors"
                          title="Void / annullert"
                        >
                          ∅
                        </button>
                      </>
                    ) : (
                      <span className={`px-2 py-1 rounded font-bold
                        ${r.outcome === "won"
                          ? "bg-green-900 text-green-300"
                          : r.outcome === "lost"
                          ? "bg-red-900 text-red-300"
                          : "bg-slate-800 text-slate-400"}`}>
                        {r.outcome === "won"
                          ? `+${r.profit} kr`
                          : r.outcome === "lost"
                          ? `${r.profit} kr`
                          : "VOID"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KalibreringsPanel */}
      {showCalibration && calibration && (
        <div className="rounded-xl border border-green-900 bg-[#0a1a0a] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-green-400 font-semibold uppercase tracking-wider">
              🎯 Modellkalibrering — Brier Score
            </p>
            <span className="text-xs text-[#64748b]">{calibration.totalResolved} avgjorte bets</span>
          </div>

          {calibration.totalResolved < 5 ? (
            <p className="text-xs text-[#64748b] text-center py-4">
              Trenger minst 5 avgjorte bets. Logg bets via 📝-knappen og marker utfall (V/T) i P&L-panelet.
            </p>
          ) : (
            <>
              {/* Hoved-stats */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="rounded-lg bg-[#1a1d27] p-2">
                  <p className={`text-lg font-bold font-mono ${
                    (calibration.brierSkill ?? 0) > 10 ? "text-green-400"
                    : (calibration.brierSkill ?? 0) > 0  ? "text-yellow-400"
                    : "text-red-400"
                  }`}>
                    {(calibration.brierSkill ?? 0) > 0 ? "+" : ""}{calibration.brierSkill}%
                  </p>
                  <p className="text-xs text-[#64748b]">Brier skill</p>
                  <p className="text-xs text-[#475569]">vs 50%-modell</p>
                </div>
                <div className="rounded-lg bg-[#1a1d27] p-2">
                  <p className="text-lg font-bold font-mono text-white">{calibration.brierScore}</p>
                  <p className="text-xs text-[#64748b]">Brier score</p>
                  <p className="text-xs text-[#475569]">↓ lavere = bedre</p>
                </div>
                <div className="rounded-lg bg-[#1a1d27] p-2">
                  <p className={`text-lg font-bold font-mono ${
                    Math.abs(calibration.calibrationBias ?? 0) < 3 ? "text-green-400"
                    : (calibration.calibrationBias ?? 0) > 0 ? "text-blue-400"
                    : "text-orange-400"
                  }`}>
                    {(calibration.calibrationBias ?? 0) > 0 ? "+" : ""}{calibration.calibrationBias}pp
                  </p>
                  <p className="text-xs text-[#64748b]">Bias</p>
                  <p className="text-xs text-[#475569]">
                    {(calibration.calibrationBias ?? 0) > 2 ? "undervurderer" : (calibration.calibrationBias ?? 0) < -2 ? "overvurderer" : "godt kalibrert"}
                  </p>
                </div>
              </div>

              {/* Kalibreringsplott */}
              {calibration.bins.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-[#64748b] mb-2">Spådd vs faktisk per sannsynlighetsspenn:</p>
                  <div className="space-y-1.5">
                    {calibration.bins.map(bin => {
                      const barWidth = Math.round(bin.actualRate);
                      const predWidth = Math.round(bin.predictedAvg);
                      const isOver = bin.delta > 3;   // undervurdert (faktisk > spådd)
                      const isUnder = bin.delta < -3; // overvurdert (faktisk < spådd)
                      return (
                        <div key={bin.label} className="text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[#94a3b8] w-14">{bin.label}</span>
                            <span className="text-[#64748b]">{bin.count} bets</span>
                            <span className={`font-mono font-semibold ${isOver ? "text-blue-400" : isUnder ? "text-orange-400" : "text-green-400"}`}>
                              {bin.actualRate}% faktisk
                              {Math.abs(bin.delta) >= 3 && (
                                <span className="ml-1 text-[#64748b]">
                                  ({bin.delta > 0 ? "+" : ""}{bin.delta}pp)
                                </span>
                              )}
                            </span>
                          </div>
                          {/* Bar: grå = spådd, farget = faktisk */}
                          <div className="relative h-2 bg-[#1a1d27] rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 left-0 h-full bg-[#334155] rounded-full"
                              style={{ width: `${predWidth}%` }}
                            />
                            <div
                              className={`absolute top-0 left-0 h-full rounded-full opacity-80 ${
                                isOver ? "bg-blue-500" : isUnder ? "bg-orange-500" : "bg-green-500"
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-[#64748b]">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-[#334155] mr-1" />Spådd</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Faktisk (OK)</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Undervurdert</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />Overvurdert</span>
                  </div>
                </div>
              )}

              {/* Per-marked */}
              {calibration.perMarket.length > 0 && (
                <div>
                  <p className="text-xs text-[#64748b] mb-1">Brier score per marked:</p>
                  <div className="flex flex-wrap gap-2">
                    {calibration.perMarket.map(m => (
                      <span key={m.market}
                        className="text-xs px-2 py-1 rounded bg-[#1a1d27] text-[#94a3b8]">
                        {m.market}{" "}
                        <span className={`font-mono font-bold ${m.brierScore < 0.20 ? "text-green-400" : m.brierScore < 0.25 ? "text-yellow-400" : "text-red-400"}`}>
                          {m.brierScore}
                        </span>
                        <span className="text-[#475569] ml-1">({m.count})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-[#475569] mt-3">
                Brier skill: +10%+ = god modell · 0% = like bra som 50%-gjett · negativ = dårligere enn tilfeldig
              </p>
            </>
          )}
        </div>
      )}

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
