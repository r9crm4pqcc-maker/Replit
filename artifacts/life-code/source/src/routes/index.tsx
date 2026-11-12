import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/life/home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Life Code" },
      { name: "description", content: "Birth chart, date library, reports, timing, and compatibility. Sports and stocks stay in their own sections." },
    ],
  }),
  component: HomePage,
});
