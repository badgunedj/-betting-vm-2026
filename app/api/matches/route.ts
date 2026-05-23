import { NextResponse } from "next/server";
import { getUpcomingFixtures } from "@/lib/api-football";

export async function GET() {
  try {
    const fixtures = await getUpcomingFixtures();
    return NextResponse.json({ fixtures });
  } catch (error) {
    console.error("Matches API error:", error);
    return NextResponse.json({ fixtures: [], error: "Kunne ikke hente kamper" }, { status: 500 });
  }
}
