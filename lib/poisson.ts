// Poisson-modell for fotballprediksjoner
// Bruker lagenes angrepsstyrke/forsvarsstyrke relativt til ligasnitt
// Dixon-Coles-inspirert tilnærming i TypeScript

// Poisson sannsynlighetsmassefunksjon: P(X = k) = e^(-λ) * λ^k / k!
function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

export interface PoissonPrediction {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
}

// Beregn kamputfall fra forventede mål
export function poissonPredict(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  maxGoals = 8
): PoissonPrediction {
  let homeWin = 0, draw = 0, awayWin = 0, over25 = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(expectedHomeGoals, h) * poissonPMF(expectedAwayGoals, a);
      if (h > a)      homeWin += p;
      else if (h < a) awayWin += p;
      else            draw    += p;
      if (h + a > 2.5) over25 += p;
    }
  }

  return { homeWin, draw, awayWin, over25, expectedHomeGoals, expectedAwayGoals };
}

// Eliteserien: gjennomsnitt ~1.38 mål per lag per kamp (sesong 2024/2025)
const ELITESERIEN_AVG_GOALS = 1.38;

// Utled forventede mål fra sesongstatistikk
// Angreps-/forsvarsstyrke kalkuleres relativt til ligasnitt
export function expectedGoalsFromForm(
  homeGoalsFor: number,
  homeGoalsAgainst: number,
  homePlayed: number,
  awayGoalsFor: number,
  awayGoalsAgainst: number,
  awayPlayed: number,
  leagueAvg: number = ELITESERIEN_AVG_GOALS
): { expectedHome: number; expectedAway: number } | null {
  if (homePlayed < 3 || awayPlayed < 3) return null;

  // Angrepsstyrke = mål scoret per kamp / ligasnitt
  const homeAttack  = (homeGoalsFor     / homePlayed) / leagueAvg;
  const homeDefense = (homeGoalsAgainst / homePlayed) / leagueAvg;
  const awayAttack  = (awayGoalsFor     / awayPlayed) / leagueAvg;
  const awayDefense = (awayGoalsAgainst / awayPlayed) / leagueAvg;

  // Hjemmefordel: ~15 % boost basert på Eliteserien-historikk
  const expectedHome = homeAttack * awayDefense * leagueAvg * 1.15;
  const expectedAway = awayAttack * homeDefense * leagueAvg;

  return {
    expectedHome: Math.max(0.3, Math.min(4.0, expectedHome)),
    expectedAway: Math.max(0.1, Math.min(3.0, expectedAway)),
  };
}
