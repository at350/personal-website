import { useSyncExternalStore } from "react";

export type PersistentInteractionSpread = "features" | "resume";

export interface PersistentInteractionSnapshot {
  readonly openKey: string | null;
  readonly revision: number;
}

interface PersistentInteractionStore {
  getSnapshot: () => PersistentInteractionSnapshot;
  setOpenKey: (openKey: string | null) => PersistentInteractionSnapshot;
  subscribe: (listener: () => void) => () => void;
}

function createStore(): PersistentInteractionStore {
  let snapshot: PersistentInteractionSnapshot = {
    openKey: null,
    revision: 0,
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    setOpenKey: (openKey) => {
      if (snapshot.openKey === openKey) return snapshot;

      snapshot = {
        openKey,
        revision: snapshot.revision + 1,
      };
      for (const listener of [...listeners]) listener();
      return snapshot;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const stores: Record<PersistentInteractionSpread, PersistentInteractionStore> = {
  features: createStore(),
  resume: createStore(),
};

export function getPersistentInteractionSnapshot(
  spread: PersistentInteractionSpread,
): PersistentInteractionSnapshot {
  return stores[spread].getSnapshot();
}

export function subscribePersistentInteractions(
  spread: PersistentInteractionSpread,
  listener: () => void,
): () => void {
  return stores[spread].subscribe(listener);
}

export function setPersistentInteractionOpenKey(
  spread: PersistentInteractionSpread,
  openKey: string | null,
): PersistentInteractionSnapshot {
  return stores[spread].setOpenKey(openKey);
}

export function togglePersistentInteractionOpenKey(
  spread: PersistentInteractionSpread,
  openKey: string,
): PersistentInteractionSnapshot {
  const next = stores[spread].getSnapshot().openKey === openKey ? null : openKey;
  return stores[spread].setOpenKey(next);
}

export function usePersistentInteraction(
  spread: PersistentInteractionSpread,
): PersistentInteractionSnapshot {
  const store = stores[spread];
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
