// Norske fotballnyheter fra VG RSS + TheSportsDB
// Brukes til å gi Claude kontekstuell info før analysen

export interface NewsItem {
  title: string;
  summary: string;
  published: string;
  source: string;
}

// Hent siste fotballnyheter fra VG RSS
export async function getLatestFootballNews(teamName: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      `https://www.vg.no/rss/feed/?format=rss&keywords=${encodeURIComponent(teamName)}`,
      {
        next: { revalidate: 1800 }, // 30 min cache
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return [];

    const xml = await res.text();
    const items: NewsItem[] = [];

    // Enkel RSS XML-parser (ingen ekstra bibliotek)
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of matches) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? item.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? item.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      if (title && (
        title.toLowerCase().includes(teamName.toLowerCase()) ||
        desc.toLowerCase().includes(teamName.toLowerCase())
      )) {
        items.push({
          title: title.replace(/<[^>]+>/g, "").slice(0, 100),
          summary: desc.replace(/<[^>]+>/g, "").slice(0, 200),
          published: pubDate,
          source: "VG",
        });
        if (items.length >= 3) break;
      }
    }
    return items;
  } catch {
    return [];
  }
}

// TheSportsDB gratis API — siste resultater for Eliteserien (ingen API-nøkkel)
export interface RecentResult {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}

export async function getRecentResults(leagueId: number = 4358): Promise<RecentResult[]> {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`,
      {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.events ?? []).slice(0, 20).map((e: {
      dateEvent: string;
      strHomeTeam: string;
      strAwayTeam: string;
      intHomeScore: string;
      intAwayScore: string;
    }) => ({
      date: e.dateEvent,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeGoals: parseInt(e.intHomeScore ?? "0"),
      awayGoals: parseInt(e.intAwayScore ?? "0"),
    }));
  } catch {
    return [];
  }
}

// Hent teamets siste 5 resultater fra TheSportsDB
export function getTeamRecentForm(results: RecentResult[], teamName: string): string {
  const teamResults = results
    .filter(r =>
      r.homeTeam.toLowerCase().includes(teamName.toLowerCase()) ||
      r.awayTeam.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(r.homeTeam.toLowerCase()) ||
      teamName.toLowerCase().includes(r.awayTeam.toLowerCase())
    )
    .slice(0, 5);

  return teamResults.map(r => {
    const isHome = r.homeTeam.toLowerCase().includes(teamName.toLowerCase());
    const teamGoals = isHome ? r.homeGoals : r.awayGoals;
    const oppGoals = isHome ? r.awayGoals : r.homeGoals;
    const opp = isHome ? r.awayTeam : r.homeTeam;
    const result = teamGoals > oppGoals ? "V" : teamGoals < oppGoals ? "T" : "U";
    return `${r.date}: ${result} ${teamGoals}-${oppGoals} vs ${opp}`;
  }).join(" | ") || "Ingen resultater funnet";
}
