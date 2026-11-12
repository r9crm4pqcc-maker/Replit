import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/forecasts/$")({
  beforeLoad: () => {
    throw redirect({ to: "/reports" });
  },
});
