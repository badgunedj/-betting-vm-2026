import { NextRequest, NextResponse } from "next/server";
import { getMatchOdds, impliedProbability, kellyStake, valueEdge, MAX_BOOKMAKER_MARGIN } from "@/lib/odds-api";
import { getTeamStats2026 } from "@/lib/eliteserien-stats";
import { expectedGoalsFromForm, poissonPredict } from "@/lib/poisson";
import { getNationalEloResult } from "@/lib/national-elo";
import { poissonAH } from "@/lib/poisson";
import { sendTelegramMessage, buildAlertMessage, TelegramAlert } from "@/lib/telegram";

// ── Konfig ──────────────────────────────────────────────────────────────────
const MIN_EDGE_REL = 0.05;     // 5% relativ edge-terskel
const MIN_EDGE_ABS = 0.03;     // 3pp absolutt (samme som UI)
const BANKROLL     = Number(process.env.BETTING_BANKROLL ?? "5000");
const CHAT_ID      = process.env.TELEGRAM_CHAT_ID ?? "";

const SPORTS_TO_SCAN = [
  { key: "soccer_norway_eliteserien", name: "Eliteserien 2026", isEliteserien: true  },
  { key: "soccer_fifa_world_cup",     name: "VM 2026",           isEliteserien: false },
];

// ── KV-deduplicering (Vercel KV) ─────────────────────────────────────────────
// Brukes for å unngå gjentatte varsler for samme bet
// Fallback: ingen deduplisering hvis KV ikke er satt opp

async function kvGet(key: string): Promise<string | null> {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { result: string | null };
    return data.result ?? null;
  } catch { return null; }
}

async function kvSet(key: string, ttl: number, value: string): Promise<void> {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/setex/${encodeURIComponent(key)}/${ttl}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }
}

// Dedup-sjekk: 12 timers TTL → unngår gjentatte varsler
async function isAlerted(key: string): Promise<boolean> {
  return (await kvGet(`dedup_${key}`)) !== null;
}

async function markAlerted(key: string): Promise<void> {
  await kvSet(`dedup_${key}`, 43200, "1"); // 12 timer
}

// Odds-historikk: 7 dagers TTL → sporer bevegelse på tvers av scanner-kjøringer
async function getStoredOdds(key: string): Promise<number | null> {
  const val = await kvGet(`odds_${key}`);
  if (!val) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

async function storeOdds(key: string, odds: number): Promise<void> {
  await kvSet(`odds_${key}`, 604800, String(odds)); // 7 dager
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
}

// ── Hoved-handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth: GitHub Actions / Vercel Cron sender Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CHAT_ID) {
    return NextResponse.json({ error: "TELEGRAM_CHAT_ID ikke satt" }, { status: 500 });
  }

  const newAlerts: (TelegramAlert & { alertKey: string })[] = [];
  const now       = Date.now();
  const maxFuture = now + 7 * 24 * 60 * 60 * 1000; // 7 dager frem

  for (const sport of SPORTS_TO_SCAN) {
    let matches = [];
    try {
      matches = await withTimeout(getMatchOdds(sport.key), 5000, []);
    } catch { continue; }

    for (const match of matches) {
      const kickoff = new Date(match.commenceTime).getTime();
      // Hopp over kamper som allerede har startet eller er > 7 dager unna
      if (kickoff < now || kickoff > maxFuture) continue;

      // Bare bookmakers med akseptabel margin (ikke Pinnacle)
      const bettable = match.bookmakers.filter(
        b => b.bookmaker !== "pinnacle" && b.margin <= MAX_BOOKMAKER_MARGIN
      );
      if (bettable.length === 0) continue;

      // ── Beregn vår sannsynlighetsmodell ──────────────────────────────────
      let ourHome: number | null = null;
      let ourDraw: number | null = null;
      let ourAway: number | null = null;
      let ourOver25: number | null = null;
      let ourBttsYes: number | null = null;
      let expHome: number | null = null;  // for AH beregning
      let expAway: number | null = null;

      if (sport.isEliteserien) {
        // Poisson-modell fra 2026-sesongdata
        const [hStats, aStats] = await Promise.all([
          withTimeout(getTeamStats2026(match.homeTeam).catch(() => null), 1500, null),
          withTimeout(getTeamStats2026(match.awayTeam).catch(() => null), 1500, null),
        ]);
        if (hStats && aStats && hStats.played >= 3 && aStats.played >= 3) {
          const eg = expectedGoalsFromForm(
            hStats.goalsFor, hStats.goalsAgainst, hStats.played,
            aStats.goalsFor, aStats.goalsAgainst, aStats.played,
            1.48, hStats.form ?? "", aStats.form ?? "",
          );
          if (eg) {
            const pred = poissonPredict(eg.expectedHome, eg.expectedAway);
            ourHome    = pred.homeWin;
            ourDraw    = pred.draw;
            ourAway    = pred.awayWin;
            ourOver25  = pred.over25;
            ourBttsYes = pred.bttsYes;
            expHome    = eg.expectedHome;
            expAway    = eg.expectedAway;
          }
        }
      } else {
        // VM 2026: nasjonal ELO-modell (ingen Poisson)
        const elo = getNationalEloResult(match.homeTeam, match.awayTeam);
        if (elo?.eloHomeWinProb) {
          // Tegn-andel justeres etter ELO-diff: store favorittkamper → færre uavgjort
          const eloDiff = Math.abs(elo.eloDiff ?? 0);
          const drawShare = eloDiff > 200 ? 0.20 : eloDiff > 100 ? 0.23 : 0.26;
          ourHome = elo.eloHomeWinProb * (1 - drawShare);
          ourDraw = drawShare;
          ourAway = (1 - elo.eloHomeWinProb) * (1 - drawShare);
        }
      }

      if (ourHome === null || ourDraw === null || ourAway === null) continue;

      // ── Evaluer alle markeder ─────────────────────────────────────────────
      const candidates: { market: string; ourProb: number; odds: number; bookmaker: string }[] = [
        { market: "Hjemmeseier (1)", ourProb: ourHome,   odds: match.bestHomeWin.odds, bookmaker: match.bestHomeWin.bookmaker },
        { market: "Uavgjort (X)",    ourProb: ourDraw,   odds: match.bestDraw.odds,    bookmaker: match.bestDraw.bookmaker    },
        { market: "Borteseier (2)",  ourProb: ourAway,   odds: match.bestAwayWin.odds, bookmaker: match.bestAwayWin.bookmaker },
        ...(match.bestOver25 && ourOver25 !== null
          ? [{ market: "Over 2.5 mål",  ourProb: ourOver25,  odds: match.bestOver25.odds,  bookmaker: match.bestOver25.bookmaker }]
          : []),
        ...(match.bestBttsYes && ourBttsYes !== null
          ? [{ market: "BTTS Ja",        ourProb: ourBttsYes, odds: match.bestBttsYes.odds, bookmaker: match.bestBttsYes.bookmaker }]
          : []),
      ];

      // Asian Handicap — Poisson score-matrise gir presise AH-probs
      if (expHome !== null && expAway !== null && match.ahLine !== null) {
        const ahLine = match.ahLine;
        const ahResult = poissonAH(expHome, expAway, ahLine);
        const lineStr = (l: number) => `${l > 0 ? "+" : ""}${l}`;
        if (match.bestAhHome) {
          candidates.push({
            market: `AH Hjemme (${lineStr(ahLine)})`,
            ourProb: ahResult.homeWin + 0.5 * ahResult.push,
            odds: match.bestAhHome.odds,
            bookmaker: match.bestAhHome.bookmaker,
          });
        }
        if (match.bestAhAway) {
          candidates.push({
            market: `AH Borte (${lineStr(-ahLine)})`,
            ourProb: ahResult.awayWin + 0.5 * ahResult.push,
            odds: match.bestAhAway.odds,
            bookmaker: match.bestAhAway.bookmaker,
          });
        }
      }

      for (const c of candidates) {
        if (!c.odds || c.odds <= 1 || !c.ourProb) continue;
        const relEdge = valueEdge(c.ourProb, c.odds);
        const implProb = impliedProbability(c.odds);
        const absEdge  = c.ourProb - implProb;
        if (relEdge < MIN_EDGE_REL || absEdge < MIN_EDGE_ABS) continue;

        // Deduplicering
        const alertKey = `va_${match.homeTeam}_${match.awayTeam}_${match.commenceTime}_${c.market}`
          .replace(/[\s\/]+/g, "_").slice(0, 120);
        if (await isAlerted(alertKey)) continue;

        // Odds-bevegelse: hent forrige kjøringens odds og beregn endring
        // Negativ = odds har kortet (sharps er inne) — bullish
        // Positiv = odds har driftet — marked skeptisk
        const prevOdds = await getStoredOdds(alertKey);
        const oddsMovement = prevOdds !== null
          ? Math.round(((c.odds - prevOdds) / prevOdds) * 1000) / 10
          : null;
        // Alltid oppdater lagrede odds for neste kjøring
        await storeOdds(alertKey, c.odds);

        const stake  = kellyStake(BANKROLL, c.ourProb, c.odds);
        const evNOK  = Math.round((c.ourProb * c.odds - 1) * stake);

        newAlerts.push({
          matchTitle:  `${match.homeTeam} vs ${match.awayTeam}`,
          league:       sport.name,
          matchDate:    match.commenceTime,
          market:       c.market,
          odds:         c.odds,
          bookmaker:    c.bookmaker,
          ourProb:      c.ourProb,
          impliedProb:  implProb,
          edgePct:      relEdge * 100,
          stake,
          evNOK,
          oddsMovement,
          alertKey,
        });
      }
    }
  }

  if (newAlerts.length === 0) {
    console.log("Scanner: ingen nye value bets funnet");
    return NextResponse.json({ ok: true, alerts: 0, message: "Ingen nye bets" });
  }

  // Sorter etter edge (beste øverst)
  newAlerts.sort((a, b) => b.edgePct - a.edgePct);

  // Send Telegram (maks 4096 tegn per melding — del opp ved behov)
  const message = buildAlertMessage(newAlerts);
  const sent    = await sendTelegramMessage(CHAT_ID, message);

  if (sent) {
    // Marker alt som varslet
    await Promise.all(newAlerts.map(a => markAlerted(a.alertKey)));
    console.log(`Scanner: sendte ${newAlerts.length} varsler`);
  }

  return NextResponse.json({ ok: sent, alerts: newAlerts.length });
}
