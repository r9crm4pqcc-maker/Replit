import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/feng-shui/$")({
  beforeLoad: () => {
    throw redirect({ to: "/advanced" });
  },
});
