import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AppState, Group } from "../types";
import type { Action } from "./actions";
import { reducer } from "./reducer";
import { loadStoredState, saveState, StaleStateError, STORAGE_KEY } from "./storage";
import { commitImageReferences, deleteUnusedImage, retainImageReferences } from "../lib/imageStore";

interface AppContextValue {
  state: AppState;
  dispatch: (action: Action) => boolean;
  activeGroup: Group | null;
}

const AppContext = createContext<AppContextValue | null>(null);

function receiptIds(state: AppState): Set<string> {
  return new Set(state.groups.flatMap((group) => group.expenses.flatMap((expense) =>
    expense.receiptImageId ? [expense.receiptImageId] : [],
  )));
}

export function AppProvider(props: { children: React.ReactNode }) {
  const [initial] = useState(loadStoredState);
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  const [dirty, setDirty] = useState(false);
  const [blocked, setBlocked] = useState(initial.error !== null);
  const current = useRef(initial.state);
  const committed = useRef(initial.state);
  const raw = useRef(initial.raw);
  const isBlocked = useRef(initial.error !== null);
  const pending = useRef(Promise.resolve());
  const pendingStates = useRef(new Set<AppState>());

  function protectDrafts() {
    const ids = receiptIds(current.current);
    for (const state of pendingStates.current) {
      for (const id of receiptIds(state)) ids.add(id);
    }
    retainImageReferences(ids);
  }

  function persist(next: AppState): void {
    pendingStates.current.add(next);
    protectDrafts();
    pending.current = pending.current.then(async () => {
      try {
        if (isBlocked.current) return;
        const saved = await saveState(next, raw.current);
        const previousIds = receiptIds(committed.current);
        const nextIds = receiptIds(next);
        raw.current = saved;
        committed.current = next;
        commitImageReferences(nextIds);
        setDirty(current.current !== next);
        setError(null);
        // The state reference is durable before removing any old receipt blobs.
        for (const id of previousIds) {
          if (!nextIds.has(id)) void deleteUnusedImage(id);
        }
      } catch (cause) {
        setDirty(true);
        if (cause instanceof StaleStateError) {
          isBlocked.current = true;
          setBlocked(true);
        }
        setError(cause instanceof Error ? cause.message : "Changes could not be saved.");
      } finally {
        pendingStates.current.delete(next);
        protectDrafts();
      }
    });
  }

  function dispatch(action: Action) {
    if (isBlocked.current) return false;
    const next = reducer(current.current, action);
    if (next === current.current) return false;
    current.current = next;
    setDirty(true);
    // Retain drafts while the serialized durable write is pending.
    persist(next);
    setState(next);
    return true;
  }

  useEffect(() => {
    retainImageReferences(receiptIds(current.current));
    commitImageReferences(receiptIds(committed.current));
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea !== null && event.storageArea !== localStorage) return;
        // A queued event may describe the state this tab already read on mount.
        if (localStorage.getItem(STORAGE_KEY) === raw.current) return;
      } catch {
        // Denied reads cannot establish that editing is safe.
      }
      isBlocked.current = true;
      setBlocked(true);
      setError("Saved data changed in another tab. Reload to use that version. Unsaved changes in this tab have not overwritten it.");
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (current.current !== committed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const activeGroup = state.groups.find((group) => group.id === state.activeGroupId) ?? null;

  return (
    <AppContext.Provider value={{ state, dispatch, activeGroup }}>
      {error && (
        <div role="alert" className="mx-auto max-w-5xl border border-warning bg-surface p-4 text-fg">
          <p>{error}</p>
          <p>{dirty ? "Your changes are still in this tab. Keep it open until they are saved." : "The saved record has been preserved."}</p>
          {!blocked && <button type="button" onClick={() => persist(current.current)} className="mr-4 underline">Retry saving</button>}
          <button type="button" onClick={() => window.location.reload()} className="underline">Reload saved data</button>
        </div>
      )}
      <fieldset disabled={blocked} className="min-w-0 border-0 p-0 m-0">{props.children}</fieldset>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}
