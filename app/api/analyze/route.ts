import { NextRequest, NextResponse } from "next/server";
import { getH2H } from "@/lib/api-football";
import { MatchOdds } from "@/lib/odds-api";
import { analyzeMatch } from "@/lib/analyze";

export async function POST(req: NextRequest) {
  try {
    const { homeTeam, awayTeam, bankroll, odds } = await req.json();

    // Odds sendes direkte fra klienten (allerede hentet via matches-APIet)
    const matchOdds: MatchOdds = odds;

    if (!matchOdds || !matchOdds.bookmakers?.length) {
      return NextResponse.json(
        { error: "Ingen odds tilgjengelig for denne kampen ennå" },
        { status: 404 }
      );
    }

    // H2H historikk og form hentes asynkront (med fallback hvis de feiler)
    const h2h = await getH2H(0, 0).catch(() => ({
      homeWins: 0, awayWins: 0, draws: 0, matches: []
    }));

    const analysis = await analyzeMatch(
      homeTeam,
      awayTeam,
      null, // form hentes fra sesong 2025 — skippes siden ID=0 fra OddsAPI
      null,
      h2h,
      matchOdds,
      bankroll ?? 5000
    );

    return NextResponse.json({ analysis, odds: matchOdds });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze error detalj:", msg);
    return NextResponse.json({ error: "Analyse feilet", detail: msg }, { status: 500 });
  }
}
