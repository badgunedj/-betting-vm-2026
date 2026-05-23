// Nasjonal-ELO ratings for VM 2026-deltakere
// Kilde: World Football Elo Ratings (eloratings.net) — oppdatert mai 2026
// VM 2026: 48 lag, nøytral bane (USA/Canada/Mexico) — ingen hjemmefordel i ELO-formelen
//
// VM 2026 GRUPPER (trekning 5. desember 2025, Kennedy Center, Washington DC):
//   Gruppe A: Mexico, Sør-Korea, Sør-Afrika, Tsjekkia
//   Gruppe B: Canada, Sveits, Qatar, Bosnia-Herzegovina
//   Gruppe C: Brasil, Marokko, Haiti, Skottland
//   Gruppe D: USA, Paraguay, Australia, Tyrkia
//   Gruppe E: Tyskland, Ecuador, Elfenbenskysten, Curaçao
//   Gruppe F: Nederland, Japan, Tunisia, Ukraina
//   Gruppe G: Belgia, Iran, Egypt, New Zealand
//   Gruppe H: Spania, Kapp Verde, Saudi-Arabia, Uruguay
//   Gruppe I: Frankrike, Norge, Senegal, Irak
//   Gruppe J: Argentina, Algerie, Østerrike, Jordan
//   Gruppe K: Portugal, Usbekistan, Colombia, DR Kongo
//   Gruppe L: England, Kroatia, Ghana, Panama

import { ClubEloResult } from "./club-elo";

const NATIONAL_ELO: Record<string, number> = {
  // ── GRUPPE A ─────────────────────────────────────────────────────────────────
  "Mexico":              1838,
  "South Korea":         1768,
  "South Africa":        1648,
  "Czech Republic":      1810,

  // ── GRUPPE B ─────────────────────────────────────────────────────────────────
  "Canada":              1842,
  "Switzerland":         1898,
  "Qatar":               1618,
  "Bosnia and Herzegovina": 1748,

  // ── GRUPPE C ─────────────────────────────────────────────────────────────────
  "Brazil":              1990,
  "Morocco":             1862,
  "Haiti":               1558,   // CONCACAF, play-off vinner
  "Scotland":            1792,

  // ── GRUPPE D ─────────────────────────────────────────────────────────────────
  "USA":                 1822,
  "Paraguay":            1672,
  "Australia":           1746,
  "Turkey":              1814,

  // ── GRUPPE E ─────────────────────────────────────────────────────────────────
  "Germany":             1958,
  "Ecuador":             1752,
  "Ivory Coast":         1715,
  "Curaçao":             1548,   // CONCACAF play-off vinner, VM-debutant

  // ── GRUPPE F ─────────────────────────────────────────────────────────────────
  "Netherlands":         1938,
  "Japan":               1808,
  "Tunisia":             1668,
  "Ukraine":             1830,

  // ── GRUPPE G ─────────────────────────────────────────────────────────────────
  "Belgium":             1905,
  "Iran":                1690,
  "Egypt":               1680,
  "New Zealand":         1612,

  // ── GRUPPE H ─────────────────────────────────────────────────────────────────
  "Spain":               1972,
  "Cape Verde":          1622,   // CAF, overraskende kvalifisert
  "Saudi Arabia":        1678,
  "Uruguay":             1858,

  // ── GRUPPE I (Norge sin gruppe!) ──────────────────────────────────────────────
  "France":              2010,
  "Norway":              1826,
  "Senegal":             1798,
  "Iraq":                1680,

  // ── GRUPPE J ─────────────────────────────────────────────────────────────────
  "Argentina":           2065,
  "Algeria":             1692,
  "Austria":             1832,
  "Jordan":              1658,

  // ── GRUPPE K ─────────────────────────────────────────────────────────────────
  "Portugal":            1945,
  "Uzbekistan":          1695,
  "Colombia":            1850,
  "DR Congo":            1648,

  // ── GRUPPE L ─────────────────────────────────────────────────────────────────
  "England":             1978,
  "Croatia":             1912,
  "Ghana":               1682,
  "Panama":              1662,

  // ── Ekstra ELO-oppslag for alias-navn ────────────────────────────────────────
  "Curacao":             1548,  // alias uten spesialtegn for Curaçao
  "Cabo Verde":          1622,  // alias for Cape Verde
  "Türkiye":             1814,  // alias for Turkey
};

// Alternative navn som The Odds API / andre kilder bruker
const NAME_ALIASES: Record<string, string> = {
  // Offisielle varianter
  "Cote d'Ivoire":                 "Ivory Coast",
  "Côte d'Ivoire":                 "Ivory Coast",
  "Ivory Coast":                   "Ivory Coast",
  "DR Congo":                      "DR Congo",
  "Congo DR":                      "DR Congo",
  "Democratic Republic of Congo":  "DR Congo",
  "DRC":                           "DR Congo",
  "USA":                           "USA",
  "United States":                 "USA",
  "South Korea":                   "South Korea",
  "Korea Republic":                "South Korea",
  "Bosnia":                        "Bosnia and Herzegovina",
  "Bosnia-Herzegovina":            "Bosnia and Herzegovina",
  "Czech Republic":                "Czech Republic",
  "Czechia":                       "Czech Republic",
  "Curaçao":                       "Curaçao",
  "Curacao":                       "Curaçao",
  "Cape Verde":                    "Cape Verde",
  "Cabo Verde":                    "Cape Verde",
  "Turkey":                        "Turkey",
  "Türkiye":                       "Turkey",
  // Lag som ikke er i VM 2026 er ikke inkludert her → getNationalElo returnerer null
};

function normalizeTeamName(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

export function getNationalElo(teamName: string): number | null {
  const normalized = normalizeTeamName(teamName);
  if (NATIONAL_ELO[normalized] !== undefined) return NATIONAL_ELO[normalized];

  // Fuzzy match (case-insensitive)
  const lower = normalized.toLowerCase();
  for (const [key, elo] of Object.entries(NATIONAL_ELO)) {
    if (key.toLowerCase() === lower) return elo;
  }
  return null;
}

// Beregn VM-sannsynligheter fra ELO (nøytral bane — ingen hjemmefordel)
export function getNationalEloResult(
  homeTeam: string,
  awayTeam: string
): ClubEloResult {
  const homeElo = getNationalElo(homeTeam);
  const awayElo = getNationalElo(awayTeam);

  if (!homeElo || !awayElo) {
    return { homeElo, awayElo, eloDiff: null, eloHomeWinProb: null };
  }

  const eloDiff = homeElo - awayElo;
  // Nøytral bane: ingen +100 hjemmefordel (VM spilles i USA/Canada/Mexico)
  const eloHomeWinProb = 1 / (1 + Math.pow(10, -eloDiff / 400));

  return { homeElo, awayElo, eloDiff, eloHomeWinProb };
}

// Returner Norges VM-gruppe for ekstra kontekst
export const NORWAY_VM_GROUP = {
  group: "I",
  teams: ["France", "Norway", "Senegal", "Iraq"],
  matches: [
    { opponent: "Iraq",    date: "2026-06-17" },
    { opponent: "Senegal", date: "2026-06-21" },
    { opponent: "France",  date: "2026-06-25" },
  ],
};
