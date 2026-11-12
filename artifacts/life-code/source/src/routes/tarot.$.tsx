import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tarot/$")({
  beforeLoad: () => {
    throw redirect({ to: "/advanced" });
  },
});
