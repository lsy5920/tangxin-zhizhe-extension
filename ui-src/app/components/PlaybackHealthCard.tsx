import { Activity, AlertCircle, CheckCircle, RefreshCw, Copy } from "lucide-react";

type HealthData = {
  score: number;
  label: string;
  tone: string;
  bg: string;
  summary: string;
  recommendedLabel: string;
  riskCount: number;
  risks: string[];
};

type Props = {
  health: HealthData;
  onRefresh: () => void;
  onCopyReport: () => void;
};

/**
 * 播放资源体检卡片组件
 *
 * 职责：
 * - 显示播放资源体检分数
 * - 显示推荐线路
 * - 显示风险提示
 * - 提供刷新和复制报告功能
 */
export function PlaybackHealthCard({ health, onRefresh, onCopyReport }: Props) {
  const { score, label, tone, bg, summary, recommendedLabel, riskCount, risks } = health;

  return (
    <div className={`${bg} rounded-xl p-5 border border-gray-200`}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center`}>
            {score >= 85 ? (
              <CheckCircle className={`w-6 h-6 ${tone}`} />
            ) : score >= 35 ? (
              <Activity className={`w-6 h-6 ${tone}`} />
            ) : (
              <AlertCircle className={`w-6 h-6 ${tone}`} />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">播放资源体检</h3>
            <p className="text-sm text-gray-600">检测线路质量和播放稳定性</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            title="刷新资源"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={onCopyReport}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            title="复制报告"
          >
            <Copy className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* 体检分数 */}
      <div className="flex items-center gap-6 mb-4">
        <div className="relative">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${(score / 100) * 251.2} 251.2`}
              className={tone}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${tone}`}>{score}</span>
            <span className="text-xs text-gray-600">分</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-lg text-sm font-medium ${bg} ${tone}`}>
              {label}
            </span>
            <span className="text-sm text-gray-600">推荐：{recommendedLabel}</span>
          </div>
          <p className="text-sm text-gray-700">{summary}</p>
        </div>
      </div>

      {/* 风险提示 */}
      {risks.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              风险提示（{riskCount}）
            </span>
          </div>
          <div className="space-y-2">
            {risks.slice(0, 3).map((risk, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                <p className="text-sm text-gray-700 flex-1">{risk}</p>
              </div>
            ))}
            {risks.length > 3 && (
              <p className="text-xs text-gray-500 pl-3.5">
                还有 {risks.length - 3} 条提示...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
