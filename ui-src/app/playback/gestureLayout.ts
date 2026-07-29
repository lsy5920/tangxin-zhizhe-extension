export type PlayerGestureLayout = "standard" | "mirrored";
export type GestureSide = "left" | "right";

export function gestureSeekDirection(side: GestureSide, layout: PlayerGestureLayout) {
  const standardDirection = side === "left" ? -1 : 1;
  return layout === "mirrored" ? -standardDirection : standardDirection;
}

export function gestureHoldAction(side: GestureSide, layout: PlayerGestureLayout): "rewind" | "rate-forward" {
  const forwardSide = layout === "mirrored" ? "left" : "right";
  return side === forwardSide ? "rate-forward" : "rewind";
}

/** 左右布局只交换点击/长按分区；横向滑动仍严格遵循左划回退、右划前进。 */
export function horizontalScrubSeconds(deltaX: number, surfaceWidth: number, duration: number) {
  const span = Math.max(90, Math.min(240, Number(duration || 0) * 0.12 || 90));
  return Math.round((Number(deltaX || 0) / Math.max(200, Number(surfaceWidth || 0))) * span);
}
