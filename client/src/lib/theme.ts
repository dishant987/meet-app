import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "theme";
const mq = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

export function getChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

/** Same logic as the inline script in index.html (that one runs before paint, so no flash). */
function apply() {
  const choice = getChoice();
  const dark = choice === "dark" || (choice === "system" && mq.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  listeners.forEach((l) => l());
}
mq.addEventListener("change", apply);
// another tab changed it
addEventListener("storage", (e) => e.key === KEY && apply());

export function setChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  apply();
}

/** { choice, dark }: what the person picked, and what is showing now. */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, getChoice);
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"));
  return { choice, dark };
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
