// Fixture congestion: straff lag som spiller mange kamper på kort tid
// Slitne lag scorer mindre og slipper inn mer — påvirker Poisson direkte

import { RecentResult } from "./news-feed";

export interface CongestionInfo {
  matchesLast7Days: number;
  factor: number;   // Poisson-multiplikator: 1.0 (OK) → 0.95 (litt sliten) → 0.90 (sliten)
  label: string;
}

/**
 * Teller antall kamper laget spilte de siste 7 dagene før matchDate,
 * og returnerer en fatiguekoeffisient som reduserer angrepsstyrken i Poisson-modellen.
 *
 * Terskel (basert på fotball-litteratur):
 *   0 ekstra kamper  → factor 1.00 (normal)
 *   1 kamp (2 totalt) → factor 0.95 (−5% angrep)
 *   2+ kamper         → factor 0.90 (−10% angrep)
 */
export function getCongestionFactor(
  teamName: string,
  matchDate: string,        // "YYYY-MM-DD"
  recentResults: RecentResult[],
): CongestionInfo {
  const matchDay  = new Date(matchDate);
  const windowStart = new Date(matchDay.getTime() - 7 * 24 * 60 * 60 * 1000);
  const name = teamName.toLowerCase();

  const recentMatches = recentResults.filter(r => {
    const d = new Date(r.date);
    return (
      d >= windowStart &&
      d < matchDay &&
      (
        r.homeTeam.toLowerCase().includes(name) ||
        r.awayTeam.toLowerCase().includes(name) ||
        name.includes(r.homeTeam.toLowerCase().replace(/\s+fc$/, "").trim()) ||
        name.includes(r.awayTeam.toLowerCase().replace(/\s+fc$/, "").trim())
      )
    );
  });

  const count = recentMatches.length;

  const factor =
    count >= 2 ? 0.90 :
    count === 1 ? 0.95 :
    1.00;

  const label =
    count >= 2
      ? `${count} kamper siste 7 dager ⚡ sliten (angrepsevne −10%)`
      : count === 1
      ? `${count} kamp siste 7 dager (angrepsevne −5%)`
      : "Ingen kamper siste 7 dager — frisk";

  return { matchesLast7Days: count, factor, label };
}
