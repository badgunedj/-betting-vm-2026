"use client";
import { useState, useEffect } from "react";
import MatchCard from "@/components/MatchCard";
import BankrollTracker from "@/components/BankrollTracker";
import AnalysisHistory from "@/components/AnalysisHistory";
import DagensTips from "@/components/DagensTips";
import { MatchOdds } from "@/lib/odds-api";

type Tab = "eliteserien" | "premierleague" | "worldcup" | "historikk" | "logg";

interface Fixture {
  fixture: { id: string | number; date: string };
  league: { id: number; name: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  odds?: MatchOdds;
}

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
  const plFixtures          = fixtures.filter((f) => f.league.id === 39);
  const wmFixtures          = fixtures.filter((f) => f.league.id === 1);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "eliteserien",   label: "🇳🇴 Eliteserien",    count: eliteserienFixtures.length },
    { key: "premierleague", label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League", count: plFixtures.length },
    { key: "worldcup",      label: "🌍 VM 2026",          count: wmFixtures.length },
    { key: "historikk",     label: "💾 Historikk" },
    { key: "logg",          label: "📊 Logg" },
  ];

  const currentFixtures =
    tab === "eliteserien"   ? eliteserienFixtures :
    tab === "premierleague" ? plFixtures :
    wmFixtures;

  const currentSport =
    tab === "eliteserien"   ? "eliteserien" :
    tab === "premierleague" ? "premierleague" :
    "worldCup";

  const emptyText =
    tab === "eliteserien"   ? "Ingen Eliteserien-kamper de neste 14 dagene" :
    tab === "premierleague" ? "Ingen Premier League-kamper de neste 14 dagene" :
    "VM starter 11. juni 2026 🚀";

  return (
    <div className="space-y-5">
      {/* Dagens tips — automatisk Poisson-scan */}
      {(tab === "eliteserien" || tab === "premierleague") && (
        <DagensTips bankroll={startBankroll} sport={tab} />
      )}

      {/* Tab-bar */}
      <div className="flex gap-1 bg-[#1a1d27] rounded-xl p-1 border border-[#2a2d3a] overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.key
                ? "bg-green-700 text-white shadow"
                : "text-[#64748b] hover:text-white"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 opacity-70">({t.count})</span>
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
          fixtures={currentFixtures}
          sport={currentSport}
          bankroll={startBankroll}
          emptyText={emptyText}
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
