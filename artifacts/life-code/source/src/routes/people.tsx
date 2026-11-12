import { createFileRoute } from "@tanstack/react-router";
import PeoplePage from "@/life/people";

export const Route = createFileRoute("/people")({
  head: () => ({ meta: [{ title: "People and lookup — Life Code" }] }),
  component: PeoplePage,
});
