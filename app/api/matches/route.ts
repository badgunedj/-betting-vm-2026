import { NextResponse } from "next/server";
import { getMatchOdds, SPORTS } from "@/lib/odds-api";

// Henter kamper fra The Odds API (fungerer gratis) istedet for API-Football
export async function GET() {
  try {
    const [eliteserien, worldCup, premierLeague] = await Promise.all([
      getMatchOdds(SPORTS.eliteserien),
      getMatchOdds(SPORTS.worldCup),
      getMatchOdds(SPORTS.premierLeague).catch(() => []),
    ]);

    // Bygg et felles format
    const toFixtures = (matches: typeof eliteserien, leagueId: number, leagueName: string) =>
      matches.map((m) => ({
        fixture: { id: m.matchId, date: m.commenceTime, status: { short: "NS" } },
        league: { id: leagueId, name: leagueName },
        teams: {
          home: { id: 0, name: m.homeTeam, logo: "" },
          away: { id: 0, name: m.awayTeam, logo: "" },
        },
        goals: { home: null, away: null },
        odds: m,
      }));

    const fixtures = [
      ...toFixtures(eliteserien, 103, "Eliteserien"),
      ...toFixtures(worldCup, 1, "VM 2026"),
      ...toFixtures(premierLeague, 39, "Premier League"),
    ].sort(
      (a, b) =>
        new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
    );

    return NextResponse.json({ fixtures });
  } catch (error) {
    console.error("Matches API error:", error);
    return NextResponse.json({ fixtures: [], error: "Kunne ikke hente kamper" }, { status: 500 });
  }
}
