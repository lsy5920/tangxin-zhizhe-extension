import { Download, Copy, Save, RotateCcw, ExternalLink } from "lucide-react";
import { formatBytes } from "../helpers";

type DownloadTask = {
  stage: string;
  current?: number;
  total?: number;
  bytes?: number;
  error?: string;
  transmuxError?: string;
  url?: string;
  updatedAt?: string;
};

type Props = {
  task?: DownloadTask | null;
  taskUrl: string;
  taskProgress: number;
  onCopyLink: () => void;
  onSave: () => void;
  onRetry: () => void;
  onViewTask: () => void;
};

/**
 * 当前下载任务卡片组件
 *
 * 职责：
 * - 显示当前视频的下载任务状态
 * - 显示下载进度和文件大小
 * - 提供保存、重试、查看功能
 */
export function CurrentTaskCard({
  task,
  taskUrl,
  taskProgress,
  onCopyLink,
  onSave,
  onRetry,
  onViewTask
}: Props) {
  if (!task) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <Download className="w-6 h-6 text-gray-400" />
          <div>
            <h4 className="font-medium text-gray-900 mb-1">当前视频下载</h4>
            <p className="text-sm text-gray-600">还没有创建下载任务</p>
          </div>
        </div>
      </div>
    );
  }

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      pending: "等待下载",
      fetching: "获取分片",
      downloading: "下载中",
      merging: "合并中",
      transmuxing: "转封装",
      ready: "待保存",
      complete: "已保存",
      error: "下载失败"
    };
    return labels[stage] || stage;
  };

  const getStageColor = (stage: string) => {
    if (stage === "complete") return "text-emerald-600 bg-emerald-50";
    if (stage === "ready") return "text-emerald-600 bg-emerald-50";
    if (stage === "error") return "text-rose-600 bg-rose-50";
    return "text-sky-600 bg-sky-50";
  };

  const stageLabel = getStageLabel(task.stage);
  const stageColor = getStageColor(task.stage);
  const isError = task.stage === "error";
  const isReady = task.stage === "ready";
  const isComplete = task.stage === "complete";
  const isRunning = !isError && !isReady && !isComplete;

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${stageColor} flex items-center justify-center`}>
            <Download className={`w-5 h-5 ${stageColor.split(" ")[0]}`} />
          </div>
          <div>
            <h4 className="font-medium text-gray-900">当前视频下载</h4>
            <span className={`text-sm ${stageColor.split(" ")[0]}`}>{stageLabel}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {taskUrl && (
            <>
              <button
                onClick={onCopyLink}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="复制链接"
              >
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
              <a
                href={taskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="打开链接"
              >
                <ExternalLink className="w-4 h-4 text-gray-600" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* 下载进度 */}
      {isRunning && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>下载进度</span>
            <span className="font-medium">{taskProgress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-300"
              style={{ width: `${taskProgress}%` }}
            />
          </div>
          {task.total && (
            <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
              <span>{task.current || 0} / {task.total} 分片</span>
              <span>{formatBytes(task.bytes || 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* 任务信息 */}
      <div className="space-y-2 text-sm">
        {task.bytes && task.bytes > 0 && (
          <div className="flex items-center justify-between text-gray-600">
            <span>文件大小</span>
            <span className="font-medium">{formatBytes(task.bytes)}</span>
          </div>
        )}
        {task.updatedAt && (
          <div className="flex items-center justify-between text-gray-600">
            <span>更新时间</span>
            <span className="font-medium">{task.updatedAt}</span>
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {isError && task.error && (
        <div className="mt-3 px-3 py-2 bg-rose-50 rounded-lg border border-rose-200">
          <p className="text-sm text-rose-800">{task.error}</p>
        </div>
      )}

      {task.transmuxError && (
        <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-800">转封装异常：{task.transmuxError}</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        {isReady && (
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium"
          >
            <Save className="w-4 h-4 inline mr-2" />
            保存到设备
          </button>
        )}
        {isError && (
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium"
          >
            <RotateCcw className="w-4 h-4 inline mr-2" />
            重试下载
          </button>
        )}
        {isRunning && (
          <button
            onClick={onViewTask}
            className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            查看任务详情
          </button>
        )}
      </div>
    </div>
  );
}
