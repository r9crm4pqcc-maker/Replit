import { createFileRoute } from "@tanstack/react-router";
import DatesPage from "@/life/dates";

export const Route = createFileRoute("/dates")({
  head: () => ({ meta: [{ title: "Date library — Life Code" }] }),
  component: DatesPage,
});
