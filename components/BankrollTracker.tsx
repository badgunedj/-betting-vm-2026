"use client";
import { useState, useEffect } from "react";

interface BetLog {
  id: string;
  date: string;
  match: string;
  market: string;
  odds: number;
  stake: number;
  result: "VUNNET" | "TAPT" | "VENTER";
  pnl: number;
}

const STORAGE_KEY = "betting-vm-bets";

export default function BankrollTracker({ startBankroll }: { startBankroll: number }) {
  const [bets, setBets] = useState<BetLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    match: "", market: "", odds: "", stake: "", result: "VENTER" as BetLog["result"],
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setBets(JSON.parse(stored));
  }, []);

  function saveBets(updated: BetLog[]) {
    setBets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function addBet() {
    if (!form.match || !form.odds || !form.stake) return;
    const stake = parseFloat(form.stake);
    const odds = parseFloat(form.odds);
    const pnl =
      form.result === "VUNNET"
        ? stake * (odds - 1)
        : form.result === "TAPT"
        ? -stake
        : 0;

    const bet: BetLog = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      match: form.match,
      market: form.market,
      odds,
      stake,
      result: form.result,
      pnl,
    };
    saveBets([bet, ...bets]);
    setForm({ match: "", market: "", odds: "", stake: "", result: "VENTER" });
    setShowForm(false);
  }

  function updateResult(id: string, result: BetLog["result"]) {
    const updated = bets.map((b) => {
      if (b.id !== id) return b;
      const pnl =
        result === "VUNNET" ? b.stake * (b.odds - 1) : result === "TAPT" ? -b.stake : 0;
      return { ...b, result, pnl };
    });
    saveBets(updated);
  }

  const totalPnl = bets.filter(b => b.result !== "VENTER").reduce((s, b) => s + b.pnl, 0);
  const currentBankroll = startBankroll + totalPnl;
  const roi = bets.filter(b => b.result !== "VENTER").length > 0
    ? (totalPnl / bets.filter(b => b.result !== "VENTER").reduce((s, b) => s + b.stake, 0)) * 100
    : 0;
  const wins = bets.filter((b) => b.result === "VUNNET").length;
  const settled = bets.filter((b) => b.result !== "VENTER").length;

  return (
    <div className="space-y-4">
      {/* Stats-kort */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Bankroll", value: `${currentBankroll.toFixed(0)} kr`, color: currentBankroll >= startBankroll ? "text-green-400" : "text-red-400" },
          { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)} kr`, color: totalPnl >= 0 ? "text-green-400" : "text-red-400" },
          { label: "ROI", value: `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`, color: roi >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Treffsikkerhet", value: settled > 0 ? `${wins}/${settled} (${Math.round(wins/settled*100)}%)` : "-", color: "text-white" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-4">
            <p className="text-xs text-[#64748b] mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Bankroll bar */}
      <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-4">
        <div className="flex justify-between text-xs text-[#64748b] mb-2">
          <span>Startkapital: {startBankroll} kr</span>
          <span>Nåværende: {currentBankroll.toFixed(0)} kr</span>
        </div>
        <div className="h-3 bg-[#0f1117] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${totalPnl >= 0 ? "bg-green-500" : "bg-red-500"}`}
            style={{ width: `${Math.min(100, (currentBankroll / startBankroll) * 100)}%` }}
          />
        </div>
      </div>

      {/* Legg til bet */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Bettinglogg</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-sm font-semibold text-white transition-colors"
        >
          + Logg bet
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#64748b] block mb-1">Kamp</label>
              <input
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Norge vs Irak"
                value={form.match}
                onChange={(e) => setForm({ ...form, match: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b] block mb-1">Marked</label>
              <input
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Norge vinner"
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b] block mb-1">Odds</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white"
                placeholder="1.75"
                value={form.odds}
                onChange={(e) => setForm({ ...form, odds: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b] block mb-1">Innsats (kr)</label>
              <input
                type="number"
                className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm text-white"
                placeholder="200"
                value={form.stake}
                onChange={(e) => setForm({ ...form, stake: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#64748b] block mb-1">Resultat</label>
            <div className="flex gap-2">
              {(["VENTER", "VUNNET", "TAPT"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, result: r })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    form.result === r
                      ? r === "VUNNET" ? "bg-green-600 text-white"
                        : r === "TAPT" ? "bg-red-600 text-white"
                        : "bg-[#2a2d3a] text-white"
                      : "bg-[#0f1117] text-[#64748b] border border-[#2a2d3a]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={addBet}
            className="w-full py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
          >
            Lagre bet
          </button>
        </div>
      )}

      {/* Bet-liste */}
      <div className="space-y-2">
        {bets.length === 0 ? (
          <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-8 text-center">
            <p className="text-[#64748b] text-sm">Ingen bets logget ennå</p>
          </div>
        ) : (
          bets.map((bet) => (
            <div
              key={bet.id}
              className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{bet.match}</p>
                <p className="text-xs text-[#64748b]">
                  {bet.market} • @{bet.odds.toFixed(2)} • {bet.stake} kr • {bet.date}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {bet.result === "VENTER" ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateResult(bet.id, "VUNNET")}
                      className="px-2 py-1 rounded bg-green-900 text-green-400 text-xs font-bold hover:bg-green-800"
                    >V</button>
                    <button
                      onClick={() => updateResult(bet.id, "TAPT")}
                      className="px-2 py-1 rounded bg-red-900 text-red-400 text-xs font-bold hover:bg-red-800"
                    >T</button>
                  </div>
                ) : (
                  <span className={`text-sm font-bold font-mono ${bet.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {bet.pnl >= 0 ? "+" : ""}{bet.pnl.toFixed(0)} kr
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
