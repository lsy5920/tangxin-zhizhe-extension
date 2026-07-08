import { Signal, AlertCircle, CheckCircle, Copy, ExternalLink, Play } from "lucide-react";
import { formatDuration } from "../helpers";

type LineData = {
  key: string;
  label: string;
  url?: string;
  stat?: {
    segments?: number;
    duration?: number;
    status?: string;
    error?: string;
    pending?: boolean;
  };
};

type Props = {
  lines: LineData[];
  onCopyLink: (key: string) => void;
  onOpenLink: (key: string) => void;
  onPlayLine: (key: string) => void;
};

/**
 * 播放线路列表组件
 *
 * 职责：
 * - 显示主线路和备用线路
 * - 显示线路状态和统计信息
 * - 提供复制、打开、播放功能
 */
export function PlaybackLines({ lines, onCopyLink, onOpenLink, onPlayLine }: Props) {
  const getLineState = (line: LineData) => {
    if (!line.url) {
      return {
        label: "缺少链接",
        color: "text-rose-600",
        bg: "bg-rose-50",
        icon: AlertCircle,
        ready: false
      };
    }
    if (line.stat?.error) {
      return {
        label: "探测异常",
        color: "text-amber-600",
        bg: "bg-amber-50",
        icon: AlertCircle,
        ready: false
      };
    }
    if (line.stat?.pending) {
      return {
        label: "探测中",
        color: "text-sky-600",
        bg: "bg-sky-50",
        icon: Signal,
        ready: true
      };
    }
    return {
      label: "可播放",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      icon: CheckCircle,
      ready: true
    };
  };

  return (
    <div className="space-y-3">
      {lines.map((line) => {
        const state = getLineState(line);
        const Icon = state.icon;
        const segments = line.stat?.segments || 0;
        const duration = line.stat?.duration || 0;

        return (
          <div
            key={line.key}
            className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow"
          >
            {/* 线路标题和状态 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${state.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${state.color}`} />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{line.label}</h4>
                  <span className={`text-sm ${state.color}`}>{state.label}</span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2">
                {line.url && (
                  <>
                    <button
                      onClick={() => onPlayLine(line.key)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="播放"
                      disabled={!state.ready}
                    >
                      <Play className={`w-4 h-4 ${state.ready ? 'text-gray-600' : 'text-gray-300'}`} />
                    </button>
                    <button
                      onClick={() => onCopyLink(line.key)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="复制链接"
                    >
                      <Copy className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => onOpenLink(line.key)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="打开链接"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-600" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 线路统计 */}
            {line.url && (
              <div className="flex items-center gap-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                {segments > 0 && (
                  <span className="flex items-center gap-1">
                    <Signal className="w-4 h-4" />
                    {segments} 个分片
                  </span>
                )}
                {duration > 0 && (
                  <span className="flex items-center gap-1">
                    ⏱️ {formatDuration(duration)}
                  </span>
                )}
                {line.stat?.status && (
                  <span className="text-xs text-gray-500">
                    HTTP {line.stat.status}
                  </span>
                )}
              </div>
            )}

            {/* 错误信息 */}
            {line.stat?.error && (
              <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">{line.stat.error}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
