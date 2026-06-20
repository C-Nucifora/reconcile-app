import { createContext, useContext, useEffect, useReducer } from "react";
import type { AppState, Group } from "../types";
import type { Action } from "./actions";
import { reducer } from "./reducer";
import { loadState, saveState } from "./storage";

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  activeGroup: Group | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider(props: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const activeGroup =
    state.groups.find((g) => g.id === state.activeGroupId) ?? null;

  return (
    <AppContext.Provider value={{ state, dispatch, activeGroup }}>
      {props.children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
