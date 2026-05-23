const BASE_URL = "https://v3.football.api-sports.io";
const KEY = process.env.API_FOOTBALL_KEY!;

const headers = {
  "x-apisports-key": KEY,
};

export interface Fixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; name: string; logo: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface TeamForm {
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string; // e.g. "WWDLW"
}

export interface H2HRecord {
  homeWins: number;
  awayWins: number;
  draws: number;
  matches: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number;
    awayGoals: number;
  }>;
}

// Hent kommende kamper — Eliteserien (103) + VM (1)
export async function getUpcomingFixtures(): Promise<Fixture[]> {
  const today = new Date().toISOString().split("T")[0];
  const in14days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const urls = [
    `${BASE_URL}/fixtures?league=103&season=2026&from=${today}&to=${in14days}&status=NS`,
    `${BASE_URL}/fixtures?league=1&season=2026&from=${today}&to=${in14days}&status=NS`,
  ];

  const responses = await Promise.all(
    urls.map((url) => fetch(url, { headers, next: { revalidate: 3600 } }))
  );
  const data = await Promise.all(responses.map((r) => r.json()));

  const all: Fixture[] = [
    ...(data[0]?.response ?? []),
    ...(data[1]?.response ?? []),
  ];

  return all.sort(
    (a, b) =>
      new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  );
}

// Hent lagstatistikk og form — bruker 2025 (siste sesong på gratis plan)
export async function getTeamForm(
  teamId: number,
  leagueId: number
): Promise<TeamForm | null> {
  const res = await fetch(
    `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=2025`,
    { headers, next: { revalidate: 3600 } }
  );
  const data = await res.json();
  const s = data?.response;
  if (!s) return null;

  return {
    teamId,
    teamName: s.team?.name,
    played: s.fixtures?.played?.total ?? 0,
    wins: s.fixtures?.wins?.total ?? 0,
    draws: s.fixtures?.draws?.total ?? 0,
    losses: s.fixtures?.loses?.total ?? 0,
    goalsFor: s.goals?.for?.total?.total ?? 0,
    goalsAgainst: s.goals?.against?.total?.total ?? 0,
    form: s.form ?? "",
  };
}

// Hent H2H historikk
export async function getH2H(
  team1: number,
  team2: number
): Promise<H2HRecord> {
  const res = await fetch(
    `${BASE_URL}/fixtures/headtohead?h2h=${team1}-${team2}&last=6`,
    { headers, next: { revalidate: 86400 } }
  );
  const data = await res.json();
  const matches = data?.response ?? [];

  let homeWins = 0,
    awayWins = 0,
    draws = 0;
  const history = matches.map((m: Fixture) => {
    const hg = m.goals.home ?? 0;
    const ag = m.goals.away ?? 0;
    if (hg > ag) homeWins++;
    else if (ag > hg) awayWins++;
    else draws++;
    return {
      date: m.fixture.date.split("T")[0],
      homeTeam: m.teams.home.name,
      awayTeam: m.teams.away.name,
      homeGoals: hg,
      awayGoals: ag,
    };
  });

  return { homeWins, awayWins, draws, matches: history };
}
