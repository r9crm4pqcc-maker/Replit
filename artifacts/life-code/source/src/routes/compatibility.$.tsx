import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/compatibility/$")({
  beforeLoad: () => {
    throw redirect({ to: "/people" });
  },
});
