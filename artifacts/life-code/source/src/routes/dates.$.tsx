import { createFileRoute } from "@tanstack/react-router";
import DatesPage from "@/life/dates";

export const Route = createFileRoute("/dates/$")({
  head: () => ({ meta: [{ title: "Date list — Life Code" }] }),
  component: DatesPage,
});
