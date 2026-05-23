import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasAnthropicKeyShort: !!process.env.ANTHROPIC_KEY,
    keyShortStart: process.env.ANTHROPIC_KEY?.slice(0, 15) ?? "MANGLER",
    hasFootballKey: !!process.env.API_FOOTBALL_KEY,
    hasOddsKey: !!process.env.ODDS_API_KEY,
  });
}
