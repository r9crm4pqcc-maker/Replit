import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/numerology")({
  beforeLoad: () => {
    throw redirect({ to: "/chart" });
  },
});
