import { createFileRoute } from "@tanstack/react-router";
import VedicPage from "@/life/vedic";

export const Route = createFileRoute("/vedic")({
  head: () => ({ meta: [{ title: "Vedic chart — Life Code" }] }),
  component: VedicPage,
});
