import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/matrix-calendar")({
  beforeLoad: () => {
    throw redirect({ to: "/dates" });
  },
});
