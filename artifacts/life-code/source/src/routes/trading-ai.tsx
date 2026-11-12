import { createFileRoute } from "@tanstack/react-router";
import TradingAIPage from "@/imported-pages/trading-ai";

export const Route = createFileRoute("/trading-ai")({
  head: () => ({
    meta: [
      { title: "Trading AI — Matrix Command Center" },
      { name: "description", content: "Trading AI tools and analysis." },
    ],
  }),
  component: TradingAIPage,
});
