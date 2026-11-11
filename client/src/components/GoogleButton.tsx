import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

type Gsi = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
};

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const googleEnabled = !!CLIENT_ID;

/** Google's official "Continue with Google" button. Renders nothing until VITE_GOOGLE_CLIENT_ID is set. */
export function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { dark } = useTheme();
  const cb = useRef(onCredential);
  useEffect(() => {
    cb.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        const google = (window as unknown as { google?: Gsi }).google;
        if (cancelled || !google || !box.current) return;
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => cb.current(r.credential) });
        box.current.replaceChildren(); // re-draw when the theme changes
        google.accounts.id.renderButton(box.current, {
          theme: dark ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: Math.min(box.current.offsetWidth || 384, 400),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [dark]);

  if (!CLIENT_ID) return null;
  if (failed) return <p className="text-center text-sm text-muted-foreground">Google sign-in couldn't load. Use email instead.</p>;
  // colorScheme light: in dark mode the browser otherwise paints Google's button frame with a white box around it
  return <div ref={box} style={{ colorScheme: "light" }} className="flex min-h-11 w-full justify-center" />;
}
