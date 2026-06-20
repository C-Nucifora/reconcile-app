import type { AppState } from "../types";

export const STORAGE_KEY = "reconcile.v1";

export function emptyState(): AppState {
  return { groups: [], activeGroupId: null, schemaVersion: 1 };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.groups)
    ) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore write failures (quota, private mode, etc.)
  }
}
