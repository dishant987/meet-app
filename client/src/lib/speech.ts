// Minimal types for the browser's Web Speech API (not in TypeScript's DOM types).
export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type Ctor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const CAPTION_LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "hi-IN", label: "हिन्दी (Hindi)" },
  { code: "gu-IN", label: "ગુજરાતી (Gujarati)" },
  { code: "mr-IN", label: "मराठी (Marathi)" },
  { code: "ta-IN", label: "தமிழ் (Tamil)" },
  { code: "te-IN", label: "తెలుగు (Telugu)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
];

/** Friendly text for Web Speech errors, or null when the error is harmless (we just restart). */
export function speechErrorMessage(error: string): string | null {
  switch (error) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Captions need microphone access. Allow the mic in your browser and try again.";
    case "network":
      return "Your browser blocked speech recognition (Brave does this). Use Chrome or Edge to create captions.";
    case "audio-capture":
      return "No microphone found for captions.";
    case "language-not-supported":
      return "This caption language isn't supported by your browser. Pick another one.";
    default:
      return "Captions stopped because of an error. Turn them on again to retry.";
  }
}
