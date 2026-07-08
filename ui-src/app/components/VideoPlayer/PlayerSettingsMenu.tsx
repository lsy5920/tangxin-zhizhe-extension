import { useState } from "react";
import {
  Gauge,
  Layers,
  Ratio,
  Sun,
  SkipForward,
  Settings,
  Check
} from "lucide-react";
import type { PlayerControlsState } from "./types";

type Props = {
  playerState: PlayerControlsState;
  onRateChange: (rate: number) => void;
  onQualityChange: (level: number) => void;
  onFillModeChange?: (mode: "contain" | "cover" | "fill") => void;
  onBrightnessChange?: (brightness: number) => void;
  onSeekStepChange?: (step: number) => void;
  onClose: () => void;
};

const rateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
const seekStepOptions = [5, 10, 30, 60];
const fillModeOptions = [
  { value: "contain" as const, label: "原比例", desc: "完整显示，可能有黑边" },
  { value: "cover" as const, label: "裁满", desc: "填满屏幕，可能裁剪" },
  { value: "fill" as const, label: "铺满", desc: "拉伸填满，可能变形" }
];

/**
 * 播放器设置菜单组件
 *
 * 职责：
 * - 显示播放器设置选项
 * - 支持倍速切换
 * - 支持清晰度切换
 * - 支持填充模式切换
 * - 支持亮度调节
 * - 支持快进步长切换
 */
export function PlayerSettingsMenu({
  playerState,
  onRateChange,
  onQualityChange,
  onFillModeChange,
  onBrightnessChange,
  onSeekStepChange,
  onClose
}: Props) {
  const [activeTab, setActiveTab] = useState<"speed" | "quality" | "display" | "other">("speed");

  const { rate, qualities, currentQuality, fillMode, brightness, seekStep } = playerState;

  const handleRateClick = (newRate: number) => {
    onRateChange(newRate);
  };

  const handleQualityClick = (level: number) => {
    onQualityChange(level);
  };

  const handleFillModeClick = (mode: "contain" | "cover" | "fill") => {
    onFillModeChange?.(mode);
  };

  const handleBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    onBrightnessChange?.(value);
  };

  const handleSeekStepClick = (step: number) => {
    onSeekStepChange?.(step);
  };

  const currentQualityLabel = currentQuality < 0
    ? "自动"
    : qualities.find((q) => q.level === currentQuality)?.label || "自动";

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-72 bg-black/95 backdrop-blur-sm rounded-lg shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 标签页 */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab("speed")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "speed"
              ? "text-white bg-white/10"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          倍速
        </button>
        <button
          onClick={() => setActiveTab("quality")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "quality"
              ? "text-white bg-white/10"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          清晰度
        </button>
        <button
          onClick={() => setActiveTab("display")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "display"
              ? "text-white bg-white/10"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          显示
        </button>
        <button
          onClick={() => setActiveTab("other")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "other"
              ? "text-white bg-white/10"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          其他
        </button>
      </div>

      {/* 内容区 */}
      <div className="max-h-80 overflow-y-auto">
        {/* 倍速选项 */}
        {activeTab === "speed" && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3 text-white/60 text-xs">
              <Gauge className="w-4 h-4" />
              <span>播放速度</span>
            </div>
            {rateOptions.map((option) => (
              <button
                key={option}
                onClick={() => handleRateClick(option)}
                className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                  rate === option
                    ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                    : "bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                <span>{option === 1 ? "正常" : `${option}x`}</span>
                {rate === option && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        )}

        {/* 清晰度选项 */}
        {activeTab === "quality" && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3 text-white/60 text-xs">
              <Layers className="w-4 h-4" />
              <span>视频清晰度</span>
            </div>
            {qualities.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/40 text-sm">
                当前视频不支持清晰度切换
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleQualityClick(-1)}
                  className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    currentQuality < 0
                      ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                      : "bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  <span>自动</span>
                  {currentQuality < 0 && <Check className="w-4 h-4" />}
                </button>
                {qualities.map((quality) => (
                  <button
                    key={quality.level}
                    onClick={() => handleQualityClick(quality.level)}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                      currentQuality === quality.level
                        ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                        : "bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <span>{quality.label}</span>
                    {currentQuality === quality.level && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* 显示选项 */}
        {activeTab === "display" && (
          <div className="p-4 space-y-4">
            {/* 填充模式 */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-white/60 text-xs">
                <Ratio className="w-4 h-4" />
                <span>画面填充</span>
              </div>
              <div className="space-y-2">
                {fillModeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleFillModeClick(option.value)}
                    className={`w-full px-4 py-2 rounded-lg text-left transition-colors ${
                      fillMode === option.value
                        ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                        : "bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs opacity-60 mt-0.5">{option.desc}</div>
                      </div>
                      {fillMode === option.value && <Check className="w-4 h-4" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 亮度调节 */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-white/60 text-xs">
                <Sun className="w-4 h-4" />
                <span>画面亮度</span>
              </div>
              <div className="px-2">
                <input
                  type="range"
                  min="60"
                  max="140"
                  step="5"
                  value={brightness}
                  onChange={handleBrightnessChange}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, white ${((brightness - 60) / 80) * 100}%, rgba(255,255,255,0.2) ${((brightness - 60) / 80) * 100}%)`
                  }}
                />
                <div className="flex justify-between mt-2 text-xs text-white/60">
                  <span>暗</span>
                  <span className="text-white">{brightness}%</span>
                  <span>亮</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 其他选项 */}
        {activeTab === "other" && (
          <div className="p-4 space-y-4">
            {/* 快进步长 */}
            <div>
              <div className="flex items-center gap-2 mb-3 text-white/60 text-xs">
                <SkipForward className="w-4 h-4" />
                <span>快进步长</span>
              </div>
              <div className="space-y-2">
                {seekStepOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleSeekStepClick(option)}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                      seekStep === option
                        ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white"
                        : "bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <span>{option} 秒</span>
                    {seekStep === option && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部关闭按钮 */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white text-sm font-medium transition-colors"
        >
          关闭设置
        </button>
      </div>
    </div>
  );
}
