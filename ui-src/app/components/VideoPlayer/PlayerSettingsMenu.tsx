import { useState } from "react";
import {
  Gauge,
  Layers,
  Ratio,
  Sun,
  SkipForward,
  Check,
  Cpu
} from "lucide-react";
import type { PlayerControlsState } from "./types";
import type { PlayerEngine } from "./engines/types";

type Props = {
  playerState: PlayerControlsState;
  currentEngine: PlayerEngine;
  onRateChange: (rate: number) => void;
  onQualityChange: (level: number) => void;
  onEngineChange: (engine: PlayerEngine) => void;
  onFillModeChange?: (mode: "contain" | "cover" | "fill") => void;
  onBrightnessChange?: (brightness: number) => void;
  onSeekStepChange?: (step: number) => void;
  onClose: () => void;
};

const rateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const seekStepOptions = [5, 10, 15, 30, 60];
const fillModeOptions = [
  { value: "contain" as const, label: "原比例", desc: "完整显示，保留黑边" },
  { value: "cover" as const, label: "裁满屏", desc: "填满屏幕，四周可能裁剪" },
  { value: "fill" as const, label: "铺满屏", desc: "拉伸填满，可能变形" }
];
const engineOptions: { value: PlayerEngine; label: string; desc: string }[] = [
  { value: "artplayer", label: "Artplayer", desc: "功能全面，PC端首选" },
  { value: "xgplayer", label: "西瓜播放器", desc: "字节出品，移动端优化" }
];

/**
 * 播放器设置菜单（重构版）
 *
 * 新增：
 * - 播放器引擎切换选项
 * - 3x 倍速支持
 * - 快进步长扩展至 60 秒
 */
export function PlayerSettingsMenu({
  playerState,
  currentEngine,
  onRateChange,
  onQualityChange,
  onEngineChange,
  onFillModeChange,
  onBrightnessChange,
  onSeekStepChange,
  onClose
}: Props) {
  const [activeTab, setActiveTab] = useState<"speed" | "quality" | "display" | "engine">("speed");
  const { rate, qualities, currentQuality, fillMode, brightness, seekStep } = playerState;

  const tabs = [
    { id: "speed" as const, label: "倍速" },
    { id: "quality" as const, label: "清晰度" },
    { id: "display" as const, label: "显示" },
    { id: "engine" as const, label: "引擎" }
  ];

  const currentQualityLabel = currentQuality < 0
    ? "自动"
    : qualities.find((q) => q.level === currentQuality)?.label || "自动";

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-72 bg-black/95 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden border border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 标签页 */}
      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 py-3 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-white bg-white/10 border-b-2 border-pink-500"
                : "text-white/50 hover:text-white hover:bg-white/5"
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">

        {/* 倍速 */}
        {activeTab === "speed" && (
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
              <Gauge className="w-3.5 h-3.5" />
              <span>播放速度</span>
            </div>
            {rateOptions.map((option) => (
              <button
                key={option}
                onClick={() => onRateChange(option)}
                className={[
                  "w-full px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between",
                  rate === option
                    ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold"
                    : "text-white/80 hover:bg-white/8 hover:text-white"
                ].join(" ")}
              >
                <span>{option === 1 ? "正常速度" : `${option}× 倍速`}</span>
                {rate === option && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* 清晰度 */}
        {activeTab === "quality" && (
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>视频清晰度 · 当前 {currentQualityLabel}</span>
            </div>
            {qualities.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/30 text-sm">
                当前视频无清晰度选项
              </div>
            ) : (
              <>
                <button
                  onClick={() => onQualityChange(-1)}
                  className={[
                    "w-full px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between",
                    currentQuality < 0
                      ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold"
                      : "text-white/80 hover:bg-white/8 hover:text-white"
                  ].join(" ")}
                >
                  <span>自动（推荐）</span>
                  {currentQuality < 0 && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
                {[...qualities].reverse().map((quality) => (
                  <button
                    key={quality.level}
                    onClick={() => onQualityChange(quality.level)}
                    className={[
                      "w-full px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between",
                      currentQuality === quality.level
                        ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold"
                        : "text-white/80 hover:bg-white/8 hover:text-white"
                    ].join(" ")}
                  >
                    <span>{quality.label}</span>
                    {currentQuality === quality.level && <Check className="w-4 h-4 flex-shrink-0" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* 显示设置 */}
        {activeTab === "display" && (
          <div className="p-3 space-y-4">
            {/* 填充模式 */}
            <div>
              <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
                <Ratio className="w-3.5 h-3.5" />
                <span>画面填充模式</span>
              </div>
              {fillModeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onFillModeChange?.(option.value)}
                  className={[
                    "w-full px-4 py-2.5 rounded-lg text-left transition-colors mb-1.5",
                    fillMode === option.value
                      ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white"
                      : "text-white/80 hover:bg-white/8 hover:text-white"
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{option.desc}</div>
                    </div>
                    {fillMode === option.value && <Check className="w-4 h-4 flex-shrink-0" />}
                  </div>
                </button>
              ))}
            </div>

            {/* 亮度调节 */}
            <div>
              <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
                <Sun className="w-3.5 h-3.5" />
                <span>画面亮度</span>
              </div>
              <div className="px-2">
                <input
                  type="range"
                  min="60"
                  max="140"
                  step="5"
                  value={brightness}
                  onChange={(e) => onBrightnessChange?.(Number(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                  style={{
                    accentColor: "#ec4899",
                    background: `linear-gradient(to right, #ec4899 ${((brightness - 60) / 80) * 100}%, rgba(255,255,255,0.15) ${((brightness - 60) / 80) * 100}%)`
                  }}
                />
                <div className="flex justify-between mt-1.5 text-xs text-white/40">
                  <span>暗</span>
                  <span className="text-white font-medium">{brightness}%</span>
                  <span>亮</span>
                </div>
              </div>
            </div>

            {/* 快进步长 */}
            <div>
              <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
                <SkipForward className="w-3.5 h-3.5" />
                <span>快进/快退步长</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {seekStepOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => onSeekStepChange?.(option)}
                    className={[
                      "py-2 rounded-lg text-sm font-medium transition-colors",
                      seekStep === option
                        ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white"
                        : "bg-white/5 text-white/70 hover:bg-white/12 hover:text-white"
                    ].join(" ")}
                  >
                    {option}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 播放器引擎 */}
        {activeTab === "engine" && (
          <div className="p-3 space-y-1.5">
            <div className="flex items-center gap-2 px-1 mb-2 text-white/40 text-xs">
              <Cpu className="w-3.5 h-3.5" />
              <span>播放器内核</span>
            </div>
            <div className="px-1 py-2 text-xs text-white/30 leading-relaxed">
              不同内核在特定场景下有不同的兼容性和体验效果，遇到播放异常时可尝试切换。
            </div>
            {engineOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => { onEngineChange(option.value); onClose(); }}
                className={[
                  "w-full px-4 py-3 rounded-lg text-left transition-colors",
                  currentEngine === option.value
                    ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white"
                    : "text-white/80 hover:bg-white/8 hover:text-white"
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="text-xs opacity-60 mt-0.5">{option.desc}</div>
                  </div>
                  {currentEngine === option.value && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs opacity-70">当前</span>
                      <Check className="w-4 h-4 flex-shrink-0" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 底部关闭 */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={onClose}
          className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white text-sm transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
