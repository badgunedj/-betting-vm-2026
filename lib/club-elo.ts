// Club ELO ratings from clubelo.com (free, no API key needed)
// API: http://api.clubelo.com/YYYY-MM-DD → CSV med alle europeiske klubber

export interface ClubEloResult {
  homeElo: number | null;
  awayElo: number | null;
  eloDiff: number | null;
  eloHomeWinProb: number | null; // basert på ELO-differanse + hjemmefordel
}

export async function getClubElos(
  homeClubEloName: string,
  awayClubEloName: string
): Promise<ClubEloResult> {
  const empty: ClubEloResult = { homeElo: null, awayElo: null, eloDiff: null, eloHomeWinProb: null };

  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(`http://api.clubelo.com/${today}`, {
      next: { revalidate: 86400 }, // cache 24 timer
    });
    if (!res.ok) return empty;

    const text = await res.text();
    // CSV-format: Rank,Club,Country,Level,Elo,From,To
    const eloMap: Record<string, number> = {};
    for (const line of text.split("\n").slice(1)) {
      const parts = line.split(",");
      if (parts.length < 5) continue;
      const club = parts[1]?.trim();
      const elo = parseFloat(parts[4]?.trim());
      if (club && !isNaN(elo)) eloMap[club] = elo;
    }

    const findElo = (name: string): number | null => {
      if (eloMap[name]) return eloMap[name];
      const lower = name.toLowerCase();
      for (const [key, val] of Object.entries(eloMap)) {
        if (key.toLowerCase() === lower) return val;
      }
      return null;
    };

    const homeElo = findElo(homeClubEloName);
    const awayElo = findElo(awayClubEloName);

    if (!homeElo || !awayElo) return { ...empty, homeElo, awayElo };

    const eloDiff = homeElo - awayElo;
    // ELO-formel med ~100 poeng hjemmefordel
    const eloHomeWinProb = 1 / (1 + Math.pow(10, -(eloDiff + 100) / 400));

    return { homeElo, awayElo, eloDiff, eloHomeWinProb };
  } catch {
    return empty;
  }
}
