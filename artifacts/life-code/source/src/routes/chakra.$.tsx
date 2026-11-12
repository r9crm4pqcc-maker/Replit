import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/chakra/$")({
  beforeLoad: () => {
    throw redirect({ to: "/advanced" });
  },
});
