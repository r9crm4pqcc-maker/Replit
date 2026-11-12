import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = [
  "site.api.espn.com",
  "sports.core.api.espn.com",
  "site.web.api.espn.com",
  "cdn.espn.com",
  "sbapi.nj.sportsbook.fanduel.com",
];

export const Route = createFileRoute("/api/public/espn")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target) return new Response("Missing url", { status: 400 });

        let u: URL;
        try {
          u = new URL(target);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        if (u.protocol !== "https:" || !ALLOWED.includes(u.hostname)) {
          return new Response("Host not allowed", { status: 403 });
        }

        let upstream: Response;
        try {
          upstream = await fetch(u.toString(), {
            headers: {
              accept: "application/json, text/plain, */*",
              "user-agent": "Mozilla/5.0 (compatible; SportsSchedule/1.0)",
            },
          });
        } catch {
          return new Response(JSON.stringify({ error: "ESPN feed unavailable" }), {
            status: 502,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=15, stale-while-revalidate=30",
          },
        });
      },
    },
  },
});
