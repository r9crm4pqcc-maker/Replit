import { createFileRoute } from "@tanstack/react-router";
import SportsPredictionPage from "@/imported-pages/sports-prediction";

export const Route = createFileRoute("/sports-prediction")({
  head: () => ({
    meta: [
      { title: "Sports Prediction AI — Matrix Command Center" },
      { name: "description", content: "Sports Prediction AI tools and analysis." },
    ],
  }),
  component: SportsPredictionPage,
});
