import { createFileRoute } from "@tanstack/react-router";
import SoccerAIPage from "@/imported-pages/soccer-ai";

export const Route = createFileRoute("/soccer-ai/$")({
  head: () => ({
    meta: [
      { title: "Soccer AI — Matrix Command Center" },
      { name: "description", content: "Soccer AI tools and analysis." },
    ],
  }),
  component: SoccerAIPage,
});
