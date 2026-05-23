import ClientHome from "./ClientHome";

const START_BANKROLL = parseInt(process.env.NEXT_PUBLIC_START_BANKROLL ?? "5000");

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="border-b border-[#2a2d3a] sticky top-0 z-50"
        style={{ background: "#0f1117dd", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg leading-none text-white">⚽ Bettingbot</h1>
            <p className="text-xs text-[#64748b]">Eliteserien & VM 2026</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#64748b]">Startkapital</p>
            <p className="font-bold text-green-400">{START_BANKROLL.toLocaleString("nb-NO")} kr</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <ClientHome startBankroll={START_BANKROLL} />
      </div>
    </main>
  );
}
