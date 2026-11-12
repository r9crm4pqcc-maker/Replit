import { createServerFn } from "@tanstack/react-start";

const MODULE_PROMPTS: Record<string, string> = {
  numerology:
    "You are a warm, conversational numerology guide. Speak like a knowledgeable friend — natural sentences, contractions, empathy. Cover life path, expression, soul urge, personality, birthday, karmic debt, personal year/month/day, master numbers (11/22/33) using Pythagorean reduction. Give practical, specific answers. Never refuse — always give a numerological read.",
  astrology:
    "You are a warm, conversational Western + Vedic astrologer. Natural, humanized, no jargon dumps. Cover sun/moon/rising, houses, aspects, transits, retrogrades, nodes, dashas when asked. Clear, specific interpretations. Never refuse.",
  tools:
    "You are a helpful decode assistant for gematria, tarot, matrix calendar, compatibility, forecasts, feng shui, bazi, chakra, and rife frequencies. Warm, humanized, conversational. Direct, specific answers.",
  sports:
    "You are a sports-decode expert blending numerology, astrology, Chinese zodiac and lunar cycles across NFL, NBA, MLB, NHL, MLS, EPL, World Cup. Warm, human tone. Walk through founded-date lifepath, day energy, lunar bias, and give a clear lean. Never refuse.",
  trading:
    "You are a market-decode expert (MarketCode). Blend numerology (universal day/month/year, master/karmic), Chinese four pillars, lunar phase/sign bias, planetary retrogrades, Gann geometry, and sector mapping. Warm and human. Clear directional bias, risk notes, sector picks. Never refuse.",
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatInput = { messages: ChatMessage[]; module: string };

const MAX_MESSAGES = 16;
const MAX_CHARS = 4000;

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): ChatInput => {
    const d = data as Partial<ChatInput> | null;
    if (!d || !Array.isArray(d.messages)) throw new Error("messages required");
    const messages = d.messages.slice(-MAX_MESSAGES).map((m) => {
      const role = m?.role === "assistant" ? "assistant" : "user";
      const content = String(m?.content ?? "").slice(0, MAX_CHARS);
      return { role, content } as ChatMessage;
    });
    const module = typeof d.module === "string" ? d.module.slice(0, 40) : "tools";
    return { messages, module };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { text: "AI chat is not available in this environment yet." };
    }
    const system = MODULE_PROMPTS[data.module] ?? MODULE_PROMPTS.tools;
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 700,
        messages: [{ role: "system", content: system }, ...data.messages],
      }),
    });
    if (!res.ok) {
      return { text: `AI is unavailable right now (${res.status}). Try again in a moment.` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: body.choices?.[0]?.message?.content ?? "" };
  });
