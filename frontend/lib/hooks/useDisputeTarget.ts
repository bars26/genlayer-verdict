"use client";

import { useSyncExternalStore } from "react";

/** The agent picked from the registry for a new dispute; the file-dispute form opens with it. */
let target: { agent: string; at: number } | null = null;
const listeners = new Set<() => void>();

export function openDisputeAgainst(agent: string) {
  target = { agent, at: Date.now() };
  listeners.forEach((l) => l());
}

export function useDisputeTarget() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => target,
    () => null
  );
}
