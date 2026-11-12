// Saved date / jersey edits for any team, player, coach, city or stadium. Kept in this browser for all future decodes.
import { useSyncExternalStore } from "react";

export interface EntityOverride { date?: string; jersey?: string; updated: string }
const KEY = "sports_entity_overrides_v1";
const subs = new Set<() => void>();
let cache: Record<string, EntityOverride> | null = null;

export const entityKey = (kind: string, name: string) => `${kind}:${name.trim().toLowerCase()}`;

function read(): Record<string, EntityOverride> {
  if (cache) return cache;
  if (typeof window === "undefined") return {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { cache = {}; }
  return cache!;
}
function write(next: Record<string, EntityOverride>) {
  cache = next; localStorage.setItem(KEY, JSON.stringify(next)); subs.forEach(f => f());
}
export function setOverride(key: string, patch: Partial<EntityOverride>) {
  const cur = read(); write({ ...cur, [key]: { ...cur[key], ...patch, updated: new Date().toISOString() } });
}
export function clearOverride(key: string) { const { [key]: _, ...rest } = read(); write(rest); }
const EMPTY = {};
export function useOverrides(): Record<string, EntityOverride> {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, read, () => EMPTY);
}
