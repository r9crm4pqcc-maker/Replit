import { createFileRoute } from "@tanstack/react-router";
import TimingPage from "@/life/timing";

export const Route = createFileRoute("/timing")({
  head: () => ({ meta: [{ title: "Goal timing — Life Code" }] }),
  component: TimingPage,
});
