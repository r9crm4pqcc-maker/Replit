import { useState, useEffect } from "react";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import {
  CalendarDays, Target, Users, Layers, TrendingUp, Trophy, Sun,
  ChevronDown, ChevronRight, Menu, X, Zap, Home, UserRound, Type, Coins, Orbit,
} from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LifeProvider } from "@/life/context";

function ClientDate() {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, []);
  return <>{text}</>;
}

type NavGroup = {
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  color: string;
  href?: string;
  children?: { label: string; href: string }[];
};

const navGroups: NavGroup[] = [
  { label: "Home", icon: Home, href: "/", color: "#FF6A00" },
  { label: "Your Chart", icon: UserRound, href: "/chart", color: "#FF6A00" },
  { label: "Date Library", icon: CalendarDays, href: "/dates", color: "#FF6A00" },
  { label: "Calendar", icon: Sun, href: "/reports", color: "#FF6A00" },
  { label: "Goal Timing", icon: Target, href: "/timing", color: "#FF6A00" },
  { label: "People & Lookup", icon: Users, href: "/people", color: "#FF6A00" },
  { label: "Letterology", icon: Type, href: "/letterology", color: "#FF6A00" },
  { label: "Crypto Research", icon: Coins, href: "/crypto", color: "#FF6A00" },
  { label: "Western", icon: Orbit, href: "/sky", color: "#FF6A00" },
  { label: "Vedic", icon: Orbit, href: "/vedic", color: "#FF6A00" },
  { label: "Friendly", icon: Layers, href: "/advanced", color: "#FF6A00" },
  {
    label: "Sports AI", icon: Trophy, color: "#FF6A00",
    children: [
      { label: "Sports Prediction", href: "/sports-prediction" },
      { label: "Soccer AI", href: "/soccer-ai" },
    ],
  },
  { label: "Stock Market AI", icon: TrendingUp, href: "/trading-ai", color: "#FF6A00" },
];

function NavGroupItem({ group, onClose }: { group: NavGroup; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const Icon = group.icon;
  const [open, setOpen] = useState(
    () => group.children?.some((c) => pathname.startsWith(c.href)) ?? false,
  );

  if (group.href) {
    const isActive = pathname === group.href;
    return (
      <Link
        to={group.href}
        onClick={onClose}
        className={`nav-item ${isActive ? "nav-item-active" : "nav-item-inactive"}`}
      >
        <span className="shrink-0 w-5 flex items-center justify-center">
          <Icon size={15} style={{ color: isActive ? "#000" : undefined }} />
        </span>
        <span className="flex-1 truncate">{group.label}</span>
      </Link>
    );
  }

  const anyChildActive = group.children?.some((c) => pathname.startsWith(c.href));

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`nav-item w-full text-left ${anyChildActive ? "nav-item-active" : "nav-item-inactive"}`}
      >
        <span className="shrink-0 w-5 flex items-center justify-center">
          <Icon size={15} style={{ color: anyChildActive ? "#000" : undefined }} />
        </span>
        <span className="flex-1 truncate">{group.label}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && group.children && (
        <div
          className="ml-5 mt-0.5 pl-3 space-y-0.5"
          style={{ borderLeft: "1px solid rgba(255,106,0,0.45)" }}
        >
          {group.children.map((child) => {
            const isActive =
              pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <Link
                key={child.href}
                to={child.href}
                onClick={onClose}
                className={`flex items-center py-1.5 px-2 rounded-md text-xs transition-all duration-100 ${
                  isActive ? "font-semibold" : "opacity-50 hover:opacity-80"
                }`}
                style={{ color: isActive ? group.color : undefined }}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          style={{ transition: "opacity 0.3s ease" }}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-[15.5rem] flex flex-col z-50 transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:z-auto`}
        style={{
          background: "hsl(var(--sidebar))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <div
          className="px-4 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center"
              style={{
                background: "#FF6A00",
              }}
            >
              <Zap size={15} style={{ color: "#000" }} />
            </div>
            <div>
              <h1
                className="text-[13px] font-bold tracking-[0.14em] font-display"
                style={{ color: "#FF6A00" }}
              >
                LIFE CODE
              </h1>
              <p
                className="text-[8.5px] tracking-[0.16em] uppercase"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Decode Suite
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden opacity-50 hover:opacity-90 transition-opacity"
            style={{ color: "hsl(42 40% 88%)" }}
          >
            <X size={16} />
          </button>

        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-px">
          {navGroups.map((group) => (
            <NavGroupItem key={group.label} group={group} onClose={onClose} />
          ))}
        </nav>

        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div className="flex items-center gap-2">
            <div className="status-dot-active" />
            <span
              className="text-[11px] font-medium"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              System Online
            </span>
          </div>
          <p
            className="text-[10px] mt-0.5 font-medium"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <ClientDate />
          </p>
        </div>
      </aside>
    </>
  );
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div
      className="flex h-screen overflow-hidden sparkle-bg"
      style={{ background: "hsl(var(--background))" }}
    >
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <header
          className="lg:hidden flex items-center gap-3 px-4 py-3 shrink-0"
          style={{
            background: "hsl(var(--sidebar))",
            borderBottom: "1px solid hsl(var(--sidebar-border))",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/50 hover:text-white/80 transition-colors duration-200"
          >
            <Menu size={20} />
          </button>
          <span className="text-[13px] font-bold tracking-[0.14em] font-display" style={{ color: "#FF6A00" }}>
            LIFE CODE
          </span>
        </header>
        <main className="flex-1 overflow-y-auto px-5 py-6 lg:px-10 lg:py-8">
          <LifeProvider>
            <Outlet />
          </LifeProvider>
        </main>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Life Code — chart, dates, sports and stocks" },
      { name: "description", content: "Personal numerology and astrology from one birthdate. Sports and stock tools stay in their own sections." },
      { name: "theme-color", content: "#0a0a0a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: Layout,
  notFoundComponent: NotFoundComponent,
});


function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>{children}</AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
