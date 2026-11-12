import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/astrology")({
  beforeLoad: () => {
    throw redirect({ to: "/chart" });
  },
});
