import { NextRequest, NextResponse } from "next/server";
import { getTeamForm, getH2H } from "@/lib/api-football";
import { getMatchOdds, SPORTS } from "@/lib/odds-api";
import { analyzeMatch } from "@/lib/analyze";

export async function POST(req: NextRequest) {
  try {
    const { homeTeamId, awayTeamId, homeTeam, awayTeam, leagueId, sport, bankroll } =
      await req.json();

    const sportKey = SPORTS[sport as keyof typeof SPORTS] ?? SPORTS.eliteserien;

    // Hent alt parallelt for hastighet
    const [homeForm, awayForm, h2h, allOdds] = await Promise.all([
      getTeamForm(homeTeamId, leagueId),
      getTeamForm(awayTeamId, leagueId),
      getH2H(homeTeamId, awayTeamId),
      getMatchOdds(sportKey),
    ]);

    // Finn odds for denne spesifikke kampen
    const matchOdds = allOdds.find(
      (o) =>
        (o.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) ||
          homeTeam.toLowerCase().includes(o.homeTeam.toLowerCase())) &&
        (o.awayTeam.toLowerCase().includes(awayTeam.toLowerCase()) ||
          awayTeam.toLowerCase().includes(o.awayTeam.toLowerCase()))
    );

    if (!matchOdds) {
      return NextResponse.json(
        { error: "Ingen odds tilgjengelig for denne kampen ennå" },
        { status: 404 }
      );
    }

    const analysis = await analyzeMatch(
      homeTeam,
      awayTeam,
      homeForm,
      awayForm,
      h2h,
      matchOdds,
      bankroll ?? 5000
    );

    return NextResponse.json({ analysis, odds: matchOdds });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: "Analyse feilet" }, { status: 500 });
  }
}
