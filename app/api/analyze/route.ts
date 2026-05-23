import { NextRequest, NextResponse } from "next/server";
import { getTeamForm, getH2H, getTeamInjuries } from "@/lib/api-football";
import { MatchOdds } from "@/lib/odds-api";
import { analyzeMatch } from "@/lib/analyze";
import { findTeamInfo } from "@/lib/team-map";
import { getClubElos } from "@/lib/club-elo";
import { getMatchWeather } from "@/lib/weather";
import { expectedGoalsFromForm, poissonPredict } from "@/lib/poisson";

export async function POST(req: NextRequest) {
  try {
    const { homeTeam, awayTeam, bankroll, odds, commenceTime, sport } = await req.json();

    const matchOdds: MatchOdds = odds;
    if (!matchOdds || !matchOdds.bookmakers?.length) {
      return NextResponse.json(
        { error: "Ingen odds tilgjengelig for denne kampen ennå" },
        { status: 404 }
      );
    }

    const matchDate = commenceTime
      ? commenceTime.split("T")[0]
      : new Date().toISOString().split("T")[0];

    const isEliteserien = sport === "eliteserien" || sport?.includes("norway");

    // Slå opp laginfo fra kart
    const homeInfo = findTeamInfo(homeTeam);
    const awayInfo = findTeamInfo(awayTeam);

    // Hent alle datakilder parallelt (alle har fallback ved feil)
    const [
      homeForm,
      awayForm,
      h2h,
      homeInjuries,
      awayInjuries,
      elo,
      weather,
    ] = await Promise.all([
      // Lagform: kun for Eliteserien der vi har team-IDer
      homeInfo && isEliteserien
        ? getTeamForm(homeInfo.apiFootballId, homeInfo.leagueId).catch(() => null)
        : Promise.resolve(null),

      awayInfo && isEliteserien
        ? getTeamForm(awayInfo.apiFootballId, awayInfo.leagueId).catch(() => null)
        : Promise.resolve(null),

      // H2H: kun når vi kjenner begge IDer
      homeInfo && awayInfo && isEliteserien
        ? getH2H(homeInfo.apiFootballId, awayInfo.apiFootballId).catch(() => ({
            homeWins: 0, awayWins: 0, draws: 0, matches: [],
          }))
        : Promise.resolve({ homeWins: 0, awayWins: 0, draws: 0, matches: [] }),

      // Skaderapport hjemmelag
      homeInfo && isEliteserien
        ? getTeamInjuries(homeInfo.apiFootballId, homeInfo.leagueId, 2026, matchDate).catch(() => [])
        : Promise.resolve([]),

      // Skaderapport bortelag
      awayInfo && isEliteserien
        ? getTeamInjuries(awayInfo.apiFootballId, awayInfo.leagueId, 2026, matchDate).catch(() => [])
        : Promise.resolve([]),

      // Club ELO (kun Eliteserien-klubber)
      homeInfo && awayInfo && isEliteserien
        ? getClubElos(homeInfo.clubEloName, awayInfo.clubEloName).catch(() => ({
            homeElo: null, awayElo: null, eloDiff: null, eloHomeWinProb: null,
          }))
        : Promise.resolve({ homeElo: null, awayElo: null, eloDiff: null, eloHomeWinProb: null }),

      // Vær (Eliteserien med kjente koordinater)
      homeInfo && isEliteserien
        ? getMatchWeather(homeInfo.stadiumLat, homeInfo.stadiumLon, matchDate).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Poisson-modell fra lagstatistikk
    let poissonPred = null;
    if (homeForm && awayForm) {
      const eg = expectedGoalsFromForm(
        homeForm.goalsFor, homeForm.goalsAgainst, homeForm.played,
        awayForm.goalsFor, awayForm.goalsAgainst, awayForm.played
      );
      if (eg) poissonPred = poissonPredict(eg.expectedHome, eg.expectedAway);
    }

    const analysis = await analyzeMatch(
      homeTeam,
      awayTeam,
      homeForm,
      awayForm,
      h2h,
      matchOdds,
      bankroll ?? 5000,
      elo,
      weather,
      poissonPred,
      homeInjuries,
      awayInjuries,
    );

    return NextResponse.json({ analysis, odds: matchOdds });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze error:", msg);
    return NextResponse.json({ error: "Analyse feilet", detail: msg }, { status: 500 });
  }
}
