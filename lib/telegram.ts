// Telegram Bot-integrasjon for value-bet-varsler
// Sett opp: https://t.me/BotFather → /newbot → kopier token

const API_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Telegram error:", err);
    }
    return res.ok;
  } catch (e) {
    console.error("Telegram send failed:", e);
    return false;
  }
}

export interface TelegramAlert {
  matchTitle: string;
  league: string;
  matchDate: string;
  market: string;
  odds: number;
  bookmaker: string;
  ourProb: number;
  impliedProb: number;
  edgePct: number;
  stake: number;
  evNOK: number;
}

export function buildAlertMessage(alerts: TelegramAlert[]): string {
  const plural = alerts.length > 1;
  const lines: string[] = [
    `🎯 <b>${alerts.length} VALUE BET${plural ? "S" : ""} FUNNET</b>`,
  ];

  for (const a of alerts) {
    const dateStr = new Date(a.matchDate).toLocaleDateString("nb-NO", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    lines.push(
      `\n⚽ <b>${a.matchTitle}</b>`,
      `🏆 ${a.league} · 📅 ${dateStr}`,
      `📊 <b>${a.market}</b> @ <b>${a.odds.toFixed(2)}</b> (${a.bookmaker})`,
      `📈 Edge: <b>+${a.edgePct.toFixed(1)}%</b>  |  ${(a.ourProb * 100).toFixed(0)}% vs ${(a.impliedProb * 100).toFixed(0)}% impl.`,
      `💵 Innsats: <b>${a.stake} kr</b>  |  EV: <b>+${a.evNOK} kr</b>`,
    );
    if (alerts.indexOf(a) < alerts.length - 1) lines.push("─────────────");
  }

  lines.push("\n⚡ <i>Kilde: BettingVM2026 automatisk scanner</i>");
  return lines.join("\n");
}
