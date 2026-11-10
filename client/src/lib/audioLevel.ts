import { useEffect, useState } from "react";

// One AudioContext for the whole page. Browsers create it "suspended" until the user clicks or types,
// so we resume it on the first interaction; otherwise level meters read silence.
let ctx: AudioContext | null = null;
function getContext() {
  if (!ctx) {
    ctx = new AudioContext();
    const resume = () => {
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    };
    resume();
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, resume, { passive: true });
  }
  return ctx;
}

/** Live loudness (0..1) of a microphone track, updated ~20 times a second. */
export function useAudioLevel(track?: MediaStreamTrack) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!track || track.readyState === "ended") return;
    const ac = getContext();
    const source = ac.createMediaStreamSource(new MediaStream([track]));
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length); // speech is roughly 0.02–0.2
      setLevel(Math.min(1, rms * 6));
    }, 50);
    return () => {
      clearInterval(timer);
      source.disconnect();
      setLevel(0);
    };
  }, [track]);
  return level;
}
