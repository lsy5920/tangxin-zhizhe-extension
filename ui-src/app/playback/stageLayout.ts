import type { PlayerFitMode } from "./preferences";

export type StageMediaOrientation = "landscape" | "portrait";

type MediaVariant = { width?: number; height?: number; bandwidth?: number };

export type StageLayoutEvidence = {
  orientation: StageMediaOrientation;
  source: "preference" | "video" | "manifest" | "fallback";
};

function validDimensions(width = 0, height = 0) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

/**
 * 先尊重用户明确偏好，再使用已解码视频尺寸；媒体尚未解码时使用最高信息量的 HLS 变体。
 * 这样竖屏视频在 metadata 到达前也不会先撑出一个超高页面，再发生明显布局跳动。
 */
export function resolveStageMediaOrientation(
  fitMode: PlayerFitMode,
  videoWidth = 0,
  videoHeight = 0,
  variants: MediaVariant[] = []
): StageLayoutEvidence {
  if (fitMode === "vertical") return { orientation: "portrait", source: "preference" };
  if (fitMode === "wide") return { orientation: "landscape", source: "preference" };
  if (validDimensions(videoWidth, videoHeight)) {
    return { orientation: videoHeight > videoWidth ? "portrait" : "landscape", source: "video" };
  }
  const representative = [...variants]
    .filter((item) => validDimensions(Number(item.width), Number(item.height)))
    .sort((left, right) => {
      const leftPixels = Number(left.width) * Number(left.height);
      const rightPixels = Number(right.width) * Number(right.height);
      return rightPixels - leftPixels || Number(right.bandwidth || 0) - Number(left.bandwidth || 0);
    })[0];
  if (representative) {
    return {
      orientation: Number(representative.height) > Number(representative.width) ? "portrait" : "landscape",
      source: "manifest"
    };
  }
  return { orientation: "landscape", source: "fallback" };
}
