"use client";
import { useState, useEffect } from "react";
import MatchCard from "@/components/MatchCard";
import BankrollTracker from "@/components/BankrollTracker";
import AnalysisHistory from "@/components/AnalysisHistory";
import { MatchOdds } from "@/lib/odds-api";

type Tab = "eliteserien" | "worldcup" | "historikk" | "logg";

interface Fixture {
  fixture: { id: string | number; date: string };
  league: { id: number; name: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  odds?: MatchOdds;
}

const LEAGUE_TO_SPORT: Record<number, string> = {
  103: "eliteserien",
  1: "worldCup",
};

export default function ClientHome({ startBankroll }: { startBankroll: number }) {
  const [tab, setTab] = useState<Tab>("eliteserien");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/matches")
      .then((r) => r.json())
      .then((d) => setFixtures(d.fixtures ?? []))
      .finally(() => setLoading(false));
  }, []);

  const eliteserienFixtures = fixtures.filter((f) => f.league.id === 103);
  const wmFixtures = fixtures.filter((f) => f.league.id === 1);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "eliteserien", label: "🇳🇴 Eliteserien", count: eliteserienFixtures.length },
    { key: "worldcup", label: "🌍 VM 2026", count: wmFixtures.length },
    { key: "historikk", label: "💾 Historikk" },
    { key: "logg", label: "📊 Logg" },
  ];

  return (
    <div className="space-y-5">
      {/* Tab-bar */}
      <div className="flex gap-2 bg-[#1a1d27] rounded-xl p-1 border border-[#2a2d3a]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? "bg-green-700 text-white shadow"
                : "text-[#64748b] hover:text-white"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 text-xs opacity-70">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Innhold */}
      {tab === "logg" ? (
        <BankrollTracker startBankroll={startBankroll} />
      ) : tab === "historikk" ? (
        <AnalysisHistory />
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-[#1a1d27] animate-pulse border border-[#2a2d3a]" />
          ))}
        </div>
      ) : (
        <MatchList
          fixtures={tab === "eliteserien" ? eliteserienFixtures : wmFixtures}
          sport={tab === "eliteserien" ? "eliteserien" : "worldCup"}
          bankroll={startBankroll}
          emptyText={
            tab === "eliteserien"
              ? "Ingen Eliteserien-kamper de neste 14 dagene"
              : "VM starter 11. juni 2026 🚀"
          }
        />
      )}
    </div>
  );
}

function MatchList({
  fixtures,
  sport,
  bankroll,
  emptyText,
}: {
  fixtures: Fixture[];
  sport: string;
  bankroll: number;
  emptyText: string;
}) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-10 text-center">
        <p className="text-4xl mb-3">⚽</p>
        <p className="text-[#64748b]">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fixtures.map((f) => (
        <MatchCard
          key={f.fixture.id}
          homeTeam={f.teams.home.name}
          awayTeam={f.teams.away.name}
          homeTeamId={f.teams.home.id}
          awayTeamId={f.teams.away.id}
          leagueId={f.league.id}
          leagueName={f.league.name}
          date={f.fixture.date}
          sport={sport}
          bankroll={bankroll}
          preloadedOdds={f.odds ?? null}
        />
      ))}
    </div>
  );
}
