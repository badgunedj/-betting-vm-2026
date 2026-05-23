import { NextRequest, NextResponse } from "next/server";
import { getMatchOdds, SPORTS } from "@/lib/odds-api";

export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get("sport") ?? "eliteserien";
  const sportKey = SPORTS[sport as keyof typeof SPORTS] ?? SPORTS.eliteserien;

  try {
    const odds = await getMatchOdds(sportKey);
    return NextResponse.json({ odds });
  } catch (error) {
    console.error("Odds API error:", error);
    return NextResponse.json({ odds: [], error: "Kunne ikke hente odds" }, { status: 500 });
  }
}
