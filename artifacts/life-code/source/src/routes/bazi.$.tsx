import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bazi/$")({
  beforeLoad: () => {
    throw redirect({ to: "/chart" });
  },
});
