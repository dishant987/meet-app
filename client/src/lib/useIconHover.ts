import { useRef } from "react";

type Animatable = { startAnimation: () => void; stopAnimation: () => void };

/**
 * Plays an AnimateIcons icon when its whole row/button is hovered or focused (not only the icon itself).
 * Spread `hover` on the parent and pass `ref` to the icon. Respects "reduce motion" (the icons do).
 */
export function useIconHover<T extends Animatable>() {
  const ref = useRef<T>(null);
  const play = () => ref.current?.startAnimation();
  const stop = () => ref.current?.stopAnimation();
  return { ref, hover: { onMouseEnter: play, onMouseLeave: stop, onFocus: play, onBlur: stop } };
}
