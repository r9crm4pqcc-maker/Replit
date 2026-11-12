import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendChat } from "@/lib/chat.functions";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const DAILY_LIMIT = 50;
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
const readUsage = () => {
  if (typeof window === "undefined") return { day: todayKey(), count: 0 };
  try {
    const raw = localStorage.getItem("chat-usage");
    if (!raw) return { day: todayKey(), count: 0 };
    const p = JSON.parse(raw);
    return p.day !== todayKey() ? { day: todayKey(), count: 0 } : p;
  } catch { return { day: todayKey(), count: 0 }; }
};
const writeUsage = (count: number) => typeof window !== "undefined" && localStorage.setItem("chat-usage", JSON.stringify({ day: todayKey(), count }));

export function ChatWidget({ moduleId, title }: { moduleId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(DAILY_LIMIT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chat = useServerFn(sendChat);
  const storeKey = `chat-history-${moduleId}`;

  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setMessages(JSON.parse(raw)); } catch {}
    setRemaining(DAILY_LIMIT - readUsage().count);
  }, [storeKey]);

  useEffect(() => {
    if (messages.length) localStorage.setItem(storeKey, JSON.stringify(messages));
  }, [messages, storeKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const usage = readUsage();
    if (usage.count >= DAILY_LIMIT) { alert(`Daily limit of ${DAILY_LIMIT} reached. Resets at midnight.`); return; }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setLoading(true);
    writeUsage(usage.count + 1); setRemaining(DAILY_LIMIT - usage.count - 1);

    try {
      const res = await chat({ data: { messages: next.map(m => ({ role: m.role, content: m.content })), module: moduleId } });
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: res.text }]);
    } catch (e: any) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${e?.message ?? "chat failed"}` }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: "hsl(42 55% 54%)", color: "hsl(0 0% 6%)" }}
        aria-label="Open chat">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-6rem))] rounded-xl flex flex-col overflow-hidden shadow-2xl"
             style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>{title}</div>
              <div className="text-[10px] opacity-60">{remaining}/{DAILY_LIMIT} messages left today</div>
            </div>
            <button onClick={() => { setMessages([]); localStorage.removeItem(storeKey); }} className="text-[10px] opacity-60 hover:opacity-100">Clear</button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && <div className="text-xs opacity-60 text-center pt-8">Ask anything about {title.toLowerCase()}.</div>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap"
                  style={m.role === "user"
                    ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                    : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="px-3 py-2"><Loader2 size={14} className="animate-spin opacity-70" /></div></div>}
          </div>

          <div className="p-2 flex gap-2 shrink-0" style={{ borderTop: "1px solid hsl(var(--border))" }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message…" rows={1}
              className="flex-1 resize-none rounded-md px-2 py-1.5 text-sm outline-none"
              style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }} />
            <button onClick={send} disabled={loading || !input.trim()} className="px-3 rounded-md text-sm disabled:opacity-40"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
