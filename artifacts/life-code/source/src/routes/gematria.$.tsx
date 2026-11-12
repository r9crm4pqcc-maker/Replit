import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gematria/$")({
  beforeLoad: () => {
    throw redirect({ to: "/people" });
  },
});
