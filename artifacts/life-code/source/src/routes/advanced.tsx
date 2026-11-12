import { createFileRoute } from "@tanstack/react-router";
import AdvancedPage from "@/life/advanced";

export const Route = createFileRoute("/advanced")({
  head: () => ({ meta: [{ title: "Friendly matches — Life Code" }] }),
  component: AdvancedPage,
});
