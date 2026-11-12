import { createFileRoute } from "@tanstack/react-router";
import SkyPage from "@/life/sky";

export const Route = createFileRoute("/sky")({
  head: () => ({ meta: [{ title: "Western chart — Life Code" }] }),
  component: SkyPage,
});
