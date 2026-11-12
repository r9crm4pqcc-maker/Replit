import { createFileRoute } from "@tanstack/react-router";
import ChartPage from "@/life/chart";

export const Route = createFileRoute("/chart")({
  head: () => ({ meta: [{ title: "Your chart — Life Code" }, { name: "description", content: "Life path, name, Chinese, Western, and Vedic chart from one birthdate." }] }),
  component: ChartPage,
});
