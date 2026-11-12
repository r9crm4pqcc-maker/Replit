import { createFileRoute } from "@tanstack/react-router";
import ReportsPage from "@/life/reports";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Calendar — Life Code" }] }),
  component: ReportsPage,
});
