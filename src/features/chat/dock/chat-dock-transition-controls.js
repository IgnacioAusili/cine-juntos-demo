import { dom } from "../../../core/dom.js";
import { BOTTOM_CHAT_CURTAIN_MS } from "./chat-layout-timing.js";

export function captureBottomControlsBounds() {
  const progress = dom.playerFrame?.querySelector(".player-progress-group");
  const controls = dom.playerFrame?.querySelector(".player-controls-bar");
  const elements = [
    ...(progress ? [{ element: progress, stretchX: true }] : []),
    ...Array.from(controls?.children || [])
      .filter((element) => !element.matches(".player-progress-group"))
      .map((element) => ({ element, stretchX: false })),
  ];

  return elements.flatMap(({ element, stretchX }) => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return [];
    return [{ element, stretchX, x: bounds.x, y: bounds.y, width: bounds.width }];
  });
}

export function animateBottomControlsLayout(transition) {
  const starts = transition.controlsBounds;
  if (!transition.animateRows || !starts?.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const easing = transition.collapsed
    ? "cubic-bezier(0.22, 1, 0.36, 1)"
    : "cubic-bezier(0.42, 0, 0.58, 1)";
  transition.controlsAnimations = starts.flatMap((start) => {
    if (typeof start.element.animate !== "function") return [];
    const end = start.element.getBoundingClientRect();
    if (!end.width || !end.height) return [];

    const translateX = start.x - end.x;
    const translateY = start.y - end.y;
    const scaleX = start.stretchX ? start.width / end.width : 1;
    if (
      Math.abs(translateX) < 0.5
      && Math.abs(translateY) < 0.5
      && Math.abs(scaleX - 1) < 0.005
    ) return [];

    const initialTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, 1)`;
    return [start.element.animate(
      [
        { transformOrigin: "0 50%", transform: initialTransform },
        { transformOrigin: "0 50%", transform: "none" },
      ],
      { duration: BOTTOM_CHAT_CURTAIN_MS, easing },
    )];
  });
}

export function settleBottomControlsLayout(transition) {
  for (const animation of transition?.controlsAnimations || []) {
    if (animation.playState === "running") animation.finish();
    animation.cancel();
  }
  if (transition) transition.controlsAnimations = [];
}
