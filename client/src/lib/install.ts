import { useSyncExternalStore } from "react";

// Chrome / Edge / Android fire `beforeinstallprompt` when the app can be installed; we keep it for our own button.
// Safari (iPhone, Mac) has no such event: people use Share -> Add to Home Screen / Add to Dock.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let pending: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our button instead of the browser's mini bar
    pending = e as InstallEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    changed();
  });
}

/** Register the service worker (production only; in dev it would serve stale code). */
export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

/** True when the browser says MeetApp can be installed right now. */
export const useCanInstall = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => !!pending,
    () => false,
  );

/** Shows the browser's install dialog. Resolves true if the person installed it. */
export async function installApp() {
  const e = pending;
  if (!e) return false;
  pending = null; // a prompt can only be used once
  changed();
  await e.prompt();
  return (await e.userChoice).outcome === "accepted";
}
