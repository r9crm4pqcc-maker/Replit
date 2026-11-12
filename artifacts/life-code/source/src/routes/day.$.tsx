import { createFileRoute } from "@tanstack/react-router";
import DayPage from "@/life/day";

export const Route = createFileRoute("/day/$")({
  head: () => ({ meta: [{ title: "Date reading — Life Code" }] }),
  component: DayPage,
});
