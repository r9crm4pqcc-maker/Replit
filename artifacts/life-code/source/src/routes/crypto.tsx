import { createFileRoute } from "@tanstack/react-router";
import CryptoPage from "@/life/crypto";

export const Route = createFileRoute("/crypto")({
  head: () => ({ meta: [{ title: "Crypto Research — Life Code" }] }),
  component: CryptoPage,
});
