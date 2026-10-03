"use client";

import { createContext, useContext, useSyncExternalStore, ReactNode } from "react";

type Team = "A" | "B" | "C" | null;
interface TeamContextType { team: Team; setTeam: (team: Team) => void; }
const TeamContext = createContext<TeamContextType | undefined>(undefined);
const KEY = "alerte_demo_team";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("alerte-demo-team", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("alerte-demo-team", onChange);
  };
}
function snapshot(): Team {
  const value = localStorage.getItem(KEY);
  return value === "A" || value === "B" || value === "C" ? value : null;
}
function setTeam(team: Team) {
  if (team) localStorage.setItem(KEY, team);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("alerte-demo-team"));
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const team = useSyncExternalStore(subscribe, snapshot, () => null);
  return <TeamContext.Provider value={{ team, setTeam }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error("useTeam must be used inside TeamProvider");
  return context;
}
