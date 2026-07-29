import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, Lock, Pause, Play, Sun, Unlock, Volume2, VolumeX, Zap } from "lucide-react";
import { formatDuration } from "../../helpers";
import { gestureHoldAction, gestureSeekDirection, horizontalScrubSeconds, type PlayerGestureLayout } from "../../playback/gestureLayout";

/** 手势 HUD 类型：覆盖主流播放器全部视觉反馈。 */
export type GestureHudKind =
  | ""
  | "volume"
  | "brightness"
  | "seek-back"
  | "seek-forward"
  | "seek-scrub"
  | "play"
  | "pause"
  | "lock"
  | "unlock"
  | "rate"
  | "double-left"
  | "double-right";

export type GestureHudState = {
  kind: GestureHudKind;
  text: string;
  percent?: number;
  /** 双击区域闪烁：left | center | right */
  zone?: "left" | "center" | "right" | "";
  /** 侧边竖条：音量靠右，亮度靠左 */
  sideBar?: "left" | "right" | "";
  /** HUD 箭头表示真实时间方向；镜像手势下不能再按屏幕左右猜测。 */
  direction?: "back" | "forward";
  /** 横滑目标时间；进度条与独立预览器据此显示目标帧。 */
  previewTime?: number;
};

export type GestureSurfaceProps = {
  /** 会话或媒体代次变化时立即取消旧手势，避免旧长按/横滑作用到新影片。 */
  sessionKey: string;
  enabled: boolean;
  locked: boolean;
  controlsVisible: boolean;
  seekStep: number;
  volume: number;
  muted: boolean;
  brightness: number;
  currentTime: number;
  duration: number;
  playing: boolean;
  gestureLayout: PlayerGestureLayout;
  /** 长按倍速，默认 3 */
  holdRate?: number;
  onShowHud: (hud: GestureHudState, durationMs?: number) => void;
  onClearHud?: () => void;
  onToggleControls: (show: boolean) => void;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  onSeekTo: (time: number) => void;
  onSeekPreview?: (time: number) => void;
  onSeekPreviewCancel?: () => void;
  onVolume: (volume: number, muted?: boolean) => void;
  onBrightness: (brightness: number) => void;
  onHoldRateStart: (rate: number) => void;
  onHoldRateEnd: () => void;
  onLockHint?: () => void;
  onContextMenu?: (position: { x: number; y: number }) => void;
};

type SwipeMode = "none" | "seek" | "volume" | "brightness";

type SwipeState = {
  active: boolean;
  mode: SwipeMode;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  startVolume: number;
  startBrightness: number;
  startTime: number;
  seekSeconds: number;
  /** 鼠标是否允许拖动手势（按下后移动） */
  allowMouseDrag: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

function zoneOf(x: number, left: number, width: number): "left" | "center" | "right" {
  const ratio = (x - left) / Math.max(1, width);
  if (ratio < 0.33) return "left";
  if (ratio > 0.67) return "right";
  return "center";
}

/**
 * 专业级播放器手势承接层。
 * 覆盖：单击显隐控制、三区双击、长按倍速/快退、横滑进度、左右竖滑音量亮度、滚轮音量、鼠标拖拽调节。
 */
export function PlayerGestureSurface({
  sessionKey,
  enabled,
  locked,
  controlsVisible,
  seekStep,
  volume,
  muted,
  brightness,
  currentTime,
  duration,
  playing,
  gestureLayout,
  holdRate = 3,
  onShowHud,
  onClearHud,
  onToggleControls,
  onTogglePlay,
  onSeekBy,
  onSeekTo,
  onSeekPreview,
  onSeekPreviewCancel,
  onVolume,
  onBrightness,
  onHoldRateStart,
  onHoldRateEnd,
  onLockHint,
  onContextMenu
}: GestureSurfaceProps) {
  const clickRef = useRef<{ count: number; x: number; timer?: number; lastDoubleAt: number; lastDoubleZone: "left" | "center" | "right" | "" }>({
    count: 0,
    x: 0,
    lastDoubleAt: 0,
    lastDoubleZone: ""
  });
  const suppressClickRef = useRef(false);
  const controlsVisibleOnDownRef = useRef(controlsVisible);
  // Android Chromium/Edge 会把触摸长按合成为 contextmenu；记录输入来源，避免与长按快退/倍速手势竞争。
  const lastPointerInputRef = useRef<{ type: string; at: number }>({ type: "mouse", at: 0 });
  const holdRef = useRef<{
    delay?: number;
    interval?: number;
    active: boolean;
    side: "left" | "right" | "";
    action: "" | "rewind" | "rate-forward";
  }>({ active: false, side: "", action: "" });
  const swipeRef = useRef<SwipeState>({
    active: false,
    mode: "none",
    pointerId: -1,
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    startVolume: 0.8,
    startBrightness: 100,
    startTime: 0,
    seekSeconds: 0,
    allowMouseDrag: false
  });
  const cumulativeSeekRef = useRef(0);
  const cleanupCallbacksRef = useRef({ onHoldRateEnd, onClearHud, onSeekPreviewCancel });
  cleanupCallbacksRef.current = { onHoldRateEnd, onClearHud, onSeekPreviewCancel };

  const clearHoldTimers = () => {
    const hold = holdRef.current;
    if (hold.delay) window.clearTimeout(hold.delay);
    if (hold.interval) window.clearInterval(hold.interval);
    hold.delay = undefined;
    hold.interval = undefined;
  };

  const stopHold = () => {
    const wasHold = holdRef.current.active;
    clearHoldTimers();
    if (holdRef.current.active && holdRef.current.action === "rate-forward") {
      onHoldRateEnd();
    }
    holdRef.current = { active: false, side: "", action: "" };
    return wasHold;
  };

  const finishSwipe = (commit: boolean) => {
    const swipe = swipeRef.current;
    const wasActive = swipe.active;
    if (wasActive && swipe.mode === "seek" && duration > 0) {
      const next = clamp(swipe.startTime + swipe.seekSeconds, 0, duration);
      if (commit) {
        // 即便最终又滑回起点也必须提交，让控制器结束 scrub 事务并恢复原播放状态。
        onSeekTo(next);
        if (swipe.seekSeconds !== 0) {
          onShowHud({
            kind: swipe.seekSeconds < 0 ? "seek-back" : "seek-forward",
            text: `跳到 ${formatDuration(next)}`,
            percent: percent(next, duration),
            zone: swipe.seekSeconds < 0 ? "left" : "right"
          }, 700);
        }
      } else {
        onSeekPreviewCancel?.();
      }
    } else if (wasActive && swipe.mode === "seek") {
      // 媒体时长尚未就绪时不允许遗留一个永远无法提交的预览事务。
      onSeekPreviewCancel?.();
    }
    swipeRef.current = {
      active: false,
      mode: "none",
      pointerId: -1,
      startX: 0,
      startY: 0,
      width: 0,
      height: 0,
      startVolume: volume,
      startBrightness: brightness,
      startTime: 0,
      seekSeconds: 0,
      allowMouseDrag: false
    };
    return wasActive;
  };

  useEffect(() => () => {
    // 清理延迟单击、长按和连续快退定时器，避免切线或卸载后继续修改播放器状态。
    if (clickRef.current.timer) window.clearTimeout(clickRef.current.timer);
    clickRef.current = { count: 0, x: 0, lastDoubleAt: 0, lastDoubleZone: "" };
    clearHoldTimers();
    if (holdRef.current.active && holdRef.current.action === "rate-forward") {
      cleanupCallbacksRef.current.onHoldRateEnd();
    }
    const cancellingSeekPreview = swipeRef.current.active && swipeRef.current.mode === "seek";
    holdRef.current = { active: false, side: "", action: "" };
    swipeRef.current = {
      ...swipeRef.current,
      active: false,
      mode: "none",
      pointerId: -1,
      seekSeconds: 0,
      allowMouseDrag: false
    };
    cumulativeSeekRef.current = 0;
    suppressClickRef.current = false;
    if (cancellingSeekPreview) cleanupCallbacksRef.current.onSeekPreviewCancel?.();
    cleanupCallbacksRef.current.onClearHud?.();
  }, [sessionKey]);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!enabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const state = clickRef.current;
    state.count += 1;
    state.x = x;
    if (state.timer) window.clearTimeout(state.timer);

    state.timer = window.setTimeout(() => {
      const count = state.count;
      const clickX = state.x;
      state.count = 0;
      state.timer = undefined;
      const zone = zoneOf(clickX, rect.left, rect.width);

      if (locked) {
        // 锁屏的语义是停止全部画面手势；只保留右下角独立解锁按钮。
        onShowHud({ kind: "lock", text: "已锁定 · 点击右下角解锁", percent: 100, zone: count >= 2 ? zone : "center" }, 1000);
        onLockHint?.();
        return;
      }

      if (count >= 2) {
        // 连点累计：1 秒内同侧再次双击，叠加更多秒数（主流 App 体验）。
        const now = Date.now();
        const sameZone = state.lastDoubleZone === zone && now - state.lastDoubleAt < 1000;
        if (zone === "left" || zone === "right") {
          if (!sameZone || zone !== state.lastDoubleZone) cumulativeSeekRef.current = 0;
          cumulativeSeekRef.current += seekStep;
          const totalDelta = cumulativeSeekRef.current;
          const direction = gestureSeekDirection(zone, gestureLayout);
          const signed = direction * totalDelta;
          onSeekBy(direction * seekStep);
          onShowHud({
            kind: zone === "left" ? "double-left" : "double-right",
            text: `${signed >= 0 ? "+" : ""}${signed}s`,
            zone,
            percent: zone === "left" ? 30 : 70,
            direction: direction < 0 ? "back" : "forward"
          }, 700);
          state.lastDoubleAt = now;
          state.lastDoubleZone = zone;
        } else {
          cumulativeSeekRef.current = 0;
          state.lastDoubleZone = "center";
          state.lastDoubleAt = now;
          onTogglePlay();
          onShowHud({
            kind: playing ? "pause" : "play",
            text: playing ? "已暂停" : "继续播放",
            zone: "center",
            percent: 50
          }, 650);
        }
        onToggleControls(true);
        return;
      }

      // 单击：显隐悬浮控制
      cumulativeSeekRef.current = 0;
      const wasVisible = controlsVisibleOnDownRef.current || controlsVisible;
      onToggleControls(!wasVisible);
    }, 220);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    controlsVisibleOnDownRef.current = controlsVisible;
    if (locked) return;

    const rect = event.currentTarget.getBoundingClientRect();
    // 旧浏览器可能返回空 pointerType，统一按鼠标处理。
    const pointerType = String(event.pointerType || "mouse");
    lastPointerInputRef.current = { type: pointerType, at: Date.now() };
    const isTouch = pointerType === "touch" || pointerType === "pen";
    const isMouse = pointerType === "mouse";
    // 仅鼠标左键参与拖拽手势；右键留给浏览器/菜单。
    if (isMouse && event.button !== 0) return;

    const side = event.clientX < rect.left + rect.width / 2 ? "left" : "right";
    clearHoldTimers();
    holdRef.current = { active: false, side, action: "" };
    swipeRef.current = {
      active: false,
      mode: "none",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      startVolume: muted ? 0 : volume,
      startBrightness: brightness,
      startTime: currentTime,
      seekSeconds: 0,
      allowMouseDrag: isMouse || isTouch
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 忽略
    }

    // 长按动作消费可持久化左右布局：标准为左退右进，镜像为左进右退。
    holdRef.current.delay = window.setTimeout(() => {
      if (swipeRef.current.active) return;
      const action = gestureHoldAction(side, gestureLayout);
      holdRef.current.active = true;
      holdRef.current.action = action;
      suppressClickRef.current = true;
      if (action === "rewind") {
        onSeekBy(-seekStep);
        onShowHud({ kind: "seek-back", text: `长按快退 -${seekStep}s`, zone: side, percent: side === "left" ? 25 : 75, direction: "back" }, 900);
        holdRef.current.interval = window.setInterval(() => {
          onSeekBy(-seekStep);
          onShowHud({ kind: "seek-back", text: `长按快退 -${seekStep}s`, zone: side, percent: side === "left" ? 25 : 75, direction: "back" }, 500);
        }, 480);
      } else {
        onHoldRateStart(holdRate);
        onShowHud({ kind: "rate", text: `${holdRate}x 快进中`, percent: 100, zone: side, direction: "forward" }, 1500);
      }
    }, 380);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || locked) return;
    const swipe = swipeRef.current;
    if (swipe.pointerId !== event.pointerId || !swipe.allowMouseDrag) return;
    if (holdRef.current.active) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipe.active) {
      // 阈值：触摸略敏感，鼠标略钝，减少误触。
      const threshold = event.pointerType === "touch" ? 14 : 22;
      if (absX < threshold && absY < threshold) return;
      clearHoldTimers();
      holdRef.current = { active: false, side: "", action: "" };
      swipe.active = true;
      suppressClickRef.current = true;
      if (absX >= absY * 1.05) {
        swipe.mode = "seek";
      } else {
        const mid = event.currentTarget.getBoundingClientRect().left + swipe.width / 2;
        swipe.mode = swipe.startX < mid ? "brightness" : "volume";
      }
    }

    if (swipe.mode === "seek") {
      // 镜像布局不参与横向滑动；左划回退、右划前进的映射保持不变。
      const seekSeconds = horizontalScrubSeconds(deltaX, swipe.width, duration);
      swipe.seekSeconds = seekSeconds;
      const next = clamp(swipe.startTime + seekSeconds, 0, duration || swipe.startTime + seekSeconds);
      // 每个 pointermove 都更新受控预览值；独立预览器会自行合并解码任务。
      // 主播放器不在这里 seek，松手后才由 onSeekTo 提交一次。
      onSeekPreview?.(next);
      onShowHud({
        kind: "seek-scrub",
        // 文案尽量短，避免中央大块遮挡画面
        text: `${seekSeconds >= 0 ? "+" : ""}${seekSeconds}s  ${formatDuration(next)}`,
        percent: duration ? percent(next, duration) : 50,
        zone: seekSeconds < 0 ? "left" : "right",
        direction: seekSeconds < 0 ? "back" : "forward",
        previewTime: next
      }, 700);
      return;
    }

    const travel = Math.max(140, swipe.height * 0.75);
    const ratio = -deltaY / travel;
    if (swipe.mode === "volume") {
      const nextVolume = clamp(swipe.startVolume + ratio, 0, 1);
      onVolume(nextVolume, nextVolume <= 0.001);
      onShowHud({
        kind: "volume",
        text: nextVolume <= 0.001 ? "静音" : `音量 ${Math.round(nextVolume * 100)}%`,
        percent: Math.round(nextVolume * 100),
        sideBar: "right"
      }, 900);
      return;
    }
    if (swipe.mode === "brightness") {
      // 亮度 60%~140%，映射为 0~100 进度条。
      const nextBrightness = clamp(Math.round(swipe.startBrightness + ratio * 80), 60, 140);
      onBrightness(nextBrightness);
      onShowHud({
        kind: "brightness",
        text: `亮度 ${nextBrightness}%`,
        percent: Math.round(((nextBrightness - 60) / 80) * 100),
        sideBar: "left"
      }, 900);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeRef.current.pointerId !== -1 && swipeRef.current.pointerId !== event.pointerId) return;
    const held = stopHold();
    const swiped = finishSwipe(true);
    if (held || swiped) suppressClickRef.current = true;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeRef.current.pointerId !== -1 && swipeRef.current.pointerId !== event.pointerId) return;
    const held = stopHold();
    const swiped = finishSwipe(false);
    if (held || swiped) suppressClickRef.current = true;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!enabled || locked) return;
    event.preventDefault();
    event.stopPropagation();
    // 滚轮调音量：向上增大，向下减小；按住 Shift 时改为微调亮度。
    if (event.shiftKey) {
      const next = clamp(brightness + (event.deltaY < 0 ? 5 : -5), 60, 140);
      onBrightness(next);
      onShowHud({
        kind: "brightness",
        text: `亮度 ${next}%`,
        percent: Math.round(((next - 60) / 80) * 100),
        sideBar: "left"
      }, 700);
      return;
    }
    const next = clamp((muted ? 0 : volume) + (event.deltaY < 0 ? 0.05 : -0.05), 0, 1);
    onVolume(next, next <= 0.001);
    onShowHud({
      kind: "volume",
      text: next <= 0.001 ? "静音" : `音量 ${Math.round(next * 100)}%`,
      percent: Math.round(next * 100),
      sideBar: "right"
    }, 700);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as MouseEvent & {
      pointerType?: string;
      sourceCapabilities?: { firesTouchEvents?: boolean };
    };
    const nativePointerType = String(nativeEvent.pointerType || "");
    const lastPointer = lastPointerInputRef.current;
    const recentDirectPointer = (lastPointer.type === "touch" || lastPointer.type === "pen")
      && Date.now() - lastPointer.at < 1200;
    const fromDirectPointer = nativePointerType === "touch"
      || nativePointerType === "pen"
      || nativeEvent.sourceCapabilities?.firesTouchEvents === true
      || recentDirectPointer;

    if (fromDirectPointer) {
      // 触摸/手写笔长按只服务于播放器快退或临时倍速，禁止打开自定义或浏览器菜单。
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!enabled || locked || !onContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onContextMenu({
      x: clamp(event.clientX - rect.left, 8, Math.max(8, rect.width - 8)),
      y: clamp(event.clientY - rect.top, 8, Math.max(8, rect.height - 8))
    });
  };

  return (
    <div
      className={`txzz-player-gesture-surface ${!enabled || locked ? "txzz-player-gesture-surface--disabled" : ""}`}
      role="presentation"
      aria-label="视频手势操作区域"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    />
  );
}

type GestureHudOverlayProps = {
  hud: GestureHudState;
  holdHint?: string;
};

/** 专业手势 HUD：紧凑中央提示 + 区域闪 + 侧边音量/亮度竖条（避免大块遮挡画面）。 */
export function PlayerGestureHudOverlay({ hud, holdHint }: GestureHudOverlayProps) {
  if (holdHint) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center px-4">
        <div className="txzz-player-gesture-chip max-w-[70%] truncate rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg ring-1 ring-white/12 backdrop-blur-sm">
          {holdHint}
        </div>
      </div>
    );
  }
  if (!hud.kind) return null;

  // 音量/亮度只走侧边竖条，不再叠中央大卡片
  const showCenter = !hud.sideBar && (
    hud.kind === "seek-scrub"
    || hud.kind === "seek-back"
    || hud.kind === "seek-forward"
    || hud.kind === "double-left"
    || hud.kind === "double-right"
    || hud.kind === "rate"
    || hud.kind === "play"
    || hud.kind === "pause"
    || hud.kind === "lock"
    || hud.kind === "unlock"
  );
  const barPercent = typeof hud.percent === "number" ? clamp(hud.percent, 0, 100) : 0;
  const isSeek = hud.kind === "seek-scrub" || hud.kind === "seek-back" || hud.kind === "seek-forward" || hud.kind === "double-left" || hud.kind === "double-right";
  const seekBackward = hud.direction === "back"
    || (!hud.direction && (hud.kind === "seek-back" || hud.kind === "double-left" || (hud.kind === "seek-scrub" && barPercent < 50)));
  const seekForward = hud.direction === "forward"
    || (!hud.direction && (hud.kind === "seek-forward" || hud.kind === "double-right" || (hud.kind === "seek-scrub" && barPercent >= 50)));

  return (
    <div className="pointer-events-none absolute inset-0 z-[26]">
      {/* 双击区域闪烁：更淡、更短，少挡画面 */}
      {hud.zone === "left" && <div className="txzz-gesture-zone-flash txzz-gesture-zone-left" />}
      {hud.zone === "right" && <div className="txzz-gesture-zone-flash txzz-gesture-zone-right" />}
      {hud.zone === "center" && <div className="txzz-gesture-zone-flash txzz-gesture-zone-center" />}

      {/* 左侧亮度竖条 */}
      {hud.sideBar === "left" && (
        <div className="txzz-gesture-side-bar txzz-gesture-side-bar-left">
          <Sun size={14} className="mb-1.5 text-amber-200" />
          <div className="txzz-gesture-side-track">
            <div className="txzz-gesture-side-fill bg-amber-300" style={{ height: `${barPercent}%` }} />
          </div>
          <span className="mt-1.5 text-[10px] font-semibold text-white/90">{Math.round(60 + (barPercent / 100) * 80)}</span>
        </div>
      )}

      {/* 右侧音量竖条 */}
      {hud.sideBar === "right" && (
        <div className="txzz-gesture-side-bar txzz-gesture-side-bar-right">
          {barPercent <= 0 ? <VolumeX size={14} className="mb-1.5 text-sky-200" /> : <Volume2 size={14} className="mb-1.5 text-sky-200" />}
          <div className="txzz-gesture-side-track">
            <div className="txzz-gesture-side-fill bg-sky-400" style={{ height: `${barPercent}%` }} />
          </div>
          <span className="mt-1.5 text-[10px] font-semibold text-white/90">{barPercent}</span>
        </div>
      )}

      {/* 中央 HUD：紧凑胶囊，快进/拖进度用横条小卡片 */}
      {showCenter && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          {isSeek ? (
            <div className="txzz-player-gesture-hud flex max-w-[min(14rem,72vw)] items-center gap-2 rounded-2xl bg-black/65 px-3 py-2 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12">
                  {seekBackward && <ChevronLeft size={16} />}
                  {seekForward && <ChevronRight size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold leading-tight tracking-wide">{hud.text}</div>
                  {typeof hud.percent === "number" && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/18">
                      <div className="h-full rounded-full bg-emerald-300 transition-all duration-75" style={{ width: `${barPercent}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="txzz-player-gesture-hud flex max-w-[min(11rem,70vw)] items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12">
                {hud.kind === "play" && <Play size={14} className="ml-0.5 fill-white" />}
                {hud.kind === "pause" && <Pause size={14} className="fill-white" />}
                {hud.kind === "lock" && <Lock size={13} />}
                {hud.kind === "unlock" && <Unlock size={13} />}
                {hud.kind === "rate" && <Zap size={14} />}
              </div>
              <span className="truncate text-[11px] font-semibold tracking-wide">{hud.text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
