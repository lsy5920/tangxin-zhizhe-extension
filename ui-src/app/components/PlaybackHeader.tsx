import { Film, Clock, User } from "lucide-react";

type LatestVideo = {
  movieTitle?: string;
  title?: string;
  movieId?: string;
  accountLabel?: string;
  accountUser?: string;
  fetchedAt?: string;
};

type Props = {
  latest?: LatestVideo;
  tip: string;
};

/**
 * 播放页顶部信息组件
 *
 * 职责：
 * - 显示最近视频信息
 * - 显示账号信息
 * - 显示获取时间
 * - 显示播放提示
 */
export function PlaybackHeader({ latest, tip }: Props) {
  if (!latest) {
    return (
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <Film className="w-6 h-6 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">等待播放资源</h3>
            <p className="text-sm text-gray-600">{tip}</p>
          </div>
        </div>
      </div>
    );
  }

  const title = latest.movieTitle || latest.title || "未知视频";
  const movieId = latest.movieId || "未知编号";
  const account = latest.accountLabel || latest.accountUser || "未知账号";
  const fetchTime = latest.fetchedAt || "未记录";

  return (
    <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-6 border border-gray-200">
      {/* 视频信息 */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Film className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">{title}</h3>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <Film className="w-4 h-4" />
              {movieId}
            </span>
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {account}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {fetchTime}
            </span>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      {tip && (
        <div className="bg-white/50 rounded-lg px-4 py-3 border border-gray-200">
          <p className="text-sm text-gray-700">{tip}</p>
        </div>
      )}
    </div>
  );
}
