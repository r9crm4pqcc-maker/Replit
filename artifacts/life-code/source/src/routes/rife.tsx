import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rife")({
  beforeLoad: () => {
    throw redirect({ to: "/advanced" });
  },
});
