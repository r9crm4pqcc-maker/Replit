// Wouter compatibility shim for TanStack Router.
// Provides Link and useParams APIs so ported pages compile and run unchanged.
import * as React from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: React.ReactNode;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, children, ...rest },
  ref,
) {
  const navigate = useNavigate();
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (
      e.button === 0 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      !rest.target
    ) {
      e.preventDefault();
      navigate({ to: href });
    }
  };
  return (
    <a ref={ref} href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export function useLocation(): [string, (to: string) => void] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  return [pathname, (to: string) => navigate({ to })];
}

// In wouter, sub-routes captured a :sub param. In our TanStack setup,
// sub-routes are encoded as a splat after the section root (e.g. /numerology/karmic
// resolves with splat = "karmic"). We expose that as { sub } here.
export function useParams<T extends Record<string, string | undefined> = { sub?: string }>(): T {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Detect the section root (first path segment) and treat the rest as `sub`.
  const parts = pathname.split("/").filter(Boolean);
  const sub = parts.length >= 2 ? parts.slice(1).join("/") : undefined;
  return { sub } as unknown as T;
}
