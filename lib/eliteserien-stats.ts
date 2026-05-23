// Eliteserien 2026 statistikk
// Primærkilde: football-data.co.uk NOR.csv (oppdateres automatisk)
// Fallback: hardkodet tabell (oppdatert 22. mai 2026)

export interface EliteserienTeamStats {
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string; // siste resultater, f.eks. "WWLDW"
}

// Hardkodet tabell per 22. mai 2026 — brukes som fallback
const HARDCODED_2026: Record<string, EliteserienTeamStats> = {
  "Viking":         { teamName: "Viking",         played: 9,  wins: 8, draws: 0, losses: 1, goalsFor: 27, goalsAgainst: 9,  form: "WWWWW" },
  "Tromsø":         { teamName: "Tromsø",          played: 11, wins: 7, draws: 2, losses: 2, goalsFor: 17, goalsAgainst: 13, form: "WWDWL" },
  "Bodø/Glimt":     { teamName: "Bodø/Glimt",      played: 9,  wins: 6, draws: 1, losses: 2, goalsFor: 23, goalsAgainst: 8,  form: "WWWLW" },
  "Lillestrøm":     { teamName: "Lillestrøm",      played: 10, wins: 6, draws: 1, losses: 3, goalsFor: 17, goalsAgainst: 9,  form: "WWWLW" },
  "Molde":          { teamName: "Molde",            played: 9,  wins: 5, draws: 1, losses: 3, goalsFor: 15, goalsAgainst: 10, form: "WWLWW" },
  "SK Brann":       { teamName: "SK Brann",         played: 10, wins: 4, draws: 1, losses: 5, goalsFor: 22, goalsAgainst: 15, form: "WLLWL" },
  "Brann":          { teamName: "SK Brann",         played: 10, wins: 4, draws: 1, losses: 5, goalsFor: 22, goalsAgainst: 15, form: "WLLWL" },
  "HamKam":         { teamName: "HamKam",           played: 8,  wins: 4, draws: 1, losses: 3, goalsFor: 13, goalsAgainst: 14, form: "LWWDW" },
  "Sandefjord":     { teamName: "Sandefjord",       played: 9,  wins: 4, draws: 1, losses: 4, goalsFor: 8,  goalsAgainst: 10, form: "LWWLW" },
  "Vålerenga":      { teamName: "Vålerenga",        played: 9,  wins: 3, draws: 2, losses: 4, goalsFor: 10, goalsAgainst: 14, form: "LDWLL" },
  "Kristiansund":   { teamName: "Kristiansund",     played: 9,  wins: 3, draws: 2, losses: 4, goalsFor: 9,  goalsAgainst: 13, form: "WLLWD" },
  "Fredrikstad":    { teamName: "Fredrikstad",      played: 9,  wins: 3, draws: 1, losses: 5, goalsFor: 12, goalsAgainst: 18, form: "WLLLL" },
  "Aalesund":       { teamName: "Aalesund",         played: 9,  wins: 2, draws: 3, losses: 4, goalsFor: 12, goalsAgainst: 17, form: "DLLWD" },
  "Sarpsborg 08":   { teamName: "Sarpsborg 08",     played: 9,  wins: 2, draws: 2, losses: 5, goalsFor: 9,  goalsAgainst: 14, form: "LLLWL" },
  "KFUM Oslo":      { teamName: "KFUM Oslo",        played: 9,  wins: 2, draws: 2, losses: 5, goalsFor: 10, goalsAgainst: 17, form: "LLLWL" },
  "Rosenborg":      { teamName: "Rosenborg",        played: 9,  wins: 2, draws: 2, losses: 5, goalsFor: 7,  goalsAgainst: 14, form: "DWLLL" },
  "IK Start":       { teamName: "IK Start",         played: 10, wins: 0, draws: 4, losses: 6, goalsFor: 10, goalsAgainst: 26, form: "DLDDL" },
};

// football-data.co.uk CSV-navner → our team names
const FDC_NAME_MAP: Record<string, string> = {
  "Bodo/Glimt":     "Bodø/Glimt",
  "Bodo-Glimt":     "Bodø/Glimt",
  "Tromso":         "Tromsø",
  "Valerenga":      "Vålerenga",
  "Lillestrom":     "Lillestrøm",
  "Brann":          "SK Brann",
  "SK Brann":       "SK Brann",
  "Kristiansund":   "Kristiansund",
  "Sarpsborg08":    "Sarpsborg 08",
  "Sarpsborg 08":   "Sarpsborg 08",
  "HamKam":         "HamKam",
  "Hamarkameratene":"HamKam",
  "KFUM":           "KFUM Oslo",
  "KFUM Oslo":      "KFUM Oslo",
  "Molde":          "Molde",
  "Viking":         "Viking",
  "Rosenborg":      "Rosenborg",
  "Sandefjord":     "Sandefjord",
  "Fredrikstad":    "Fredrikstad",
  "Aalesund":       "Aalesund",
  "Start":          "IK Start",
};

// Hent live data fra football-data.co.uk
async function fetchLiveStats(): Promise<Map<string, EliteserienTeamStats> | null> {
  try {
    const res = await fetch("https://www.football-data.co.uk/new/NOR.csv", {
      next: { revalidate: 21600 }, // cache 6 timer
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) return null;

    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const idxSeason   = headers.indexOf("Season");
    const idxHome     = headers.indexOf("Home");
    const idxAway     = headers.indexOf("Away");
    const idxHG       = headers.indexOf("HG");
    const idxAG       = headers.indexOf("AG");

    if ([idxSeason, idxHome, idxAway, idxHG, idxAG].includes(-1)) return null;

    // Bygg statistikk-akkumulator
    const acc: Record<string, { played: number; wins: number; draws: number; losses: number; gf: number; ga: number; results: string[] }> = {};

    const ensure = (name: string) => {
      if (!acc[name]) acc[name] = { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, results: [] };
    };

    for (const line of lines.slice(1)) {
      const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
      if (cols[idxSeason] !== "2026") continue;

      const rawHome = cols[idxHome];
      const rawAway = cols[idxAway];
      const hg = parseInt(cols[idxHG]);
      const ag = parseInt(cols[idxAG]);
      if (isNaN(hg) || isNaN(ag)) continue;

      const home = FDC_NAME_MAP[rawHome] ?? rawHome;
      const away = FDC_NAME_MAP[rawAway] ?? rawAway;

      ensure(home);
      ensure(away);

      acc[home].played++; acc[home].gf += hg; acc[home].ga += ag;
      acc[away].played++; acc[away].gf += ag; acc[away].ga += hg;

      if (hg > ag) { acc[home].wins++; acc[home].results.push("W"); acc[away].losses++; acc[away].results.push("L"); }
      else if (hg < ag) { acc[away].wins++; acc[away].results.push("W"); acc[home].losses++; acc[home].results.push("L"); }
      else { acc[home].draws++; acc[home].results.push("D"); acc[away].draws++; acc[away].results.push("D"); }
    }

    if (Object.keys(acc).length === 0) return null;

    const result = new Map<string, EliteserienTeamStats>();
    for (const [name, s] of Object.entries(acc)) {
      result.set(name, {
        teamName: name,
        played: s.played,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        goalsFor: s.gf,
        goalsAgainst: s.ga,
        form: s.results.slice(-5).join(""),
      });
    }
    return result;
  } catch {
    return null;
  }
}

// Cache i minnet (refresh ved ny request etter 6 timer)
let _cache: { data: Map<string, EliteserienTeamStats>; ts: number } | null = null;

export async function getEliteserienStats(): Promise<Map<string, EliteserienTeamStats>> {
  const now = Date.now();
  if (_cache && now - _cache.ts < 6 * 3600 * 1000) return _cache.data;

  const live = await fetchLiveStats();
  if (live && live.size > 0) {
    _cache = { data: live, ts: now };
    return live;
  }

  // Fallback til hardkodet tabell
  const fallback = new Map(Object.entries(HARDCODED_2026));
  _cache = { data: fallback, ts: now };
  return fallback;
}

export async function getTeamStats2026(teamName: string): Promise<EliteserienTeamStats | null> {
  const stats = await getEliteserienStats();

  // Direkte match
  if (stats.has(teamName)) return stats.get(teamName)!;

  // Case-insensitive + delvis match
  const lower = teamName.toLowerCase();
  for (const [key, val] of stats.entries()) {
    if (key.toLowerCase() === lower) return val;
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return val;
  }

  // Fallback til hardkodet
  return HARDCODED_2026[teamName] ?? null;
}
