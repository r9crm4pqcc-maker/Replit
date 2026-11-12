import { createFileRoute } from "@tanstack/react-router";
import LetterologyPage from "@/life/letterology";

export const Route = createFileRoute("/letterology")({
  head: () => ({ meta: [{ title: "Letterology — Life Code" }] }),
  component: LetterologyPage,
});
