import { AlertCircle, CheckCircle, Copy, Download, Play, RefreshCw, Sparkles, Star, TrendingUp, Zap } from "lucide-react";
import type { BridgeState, Page } from "../types";
import { accountName, downloadStats, downloadTasks, flowItemText, formatRelativeTime, latestFullDetail, selectedAccount, shortTime } from "../helpers";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onPage: (page: Page) => void;
};

export function OverviewPage({ state, onAction, onPage }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const latest = latestFullDetail(state);
  const selected = selectedAccount(state);
  const flow = (state.flow || []).slice(-6).reverse();

  const statusItems = [
    {
      label: "展示覆盖",
      value: state.displayPatchApplied ? "VIP 永久有效" : "待应用",
      ok: Boolean(state.displayPatchApplied),
      action: () => onAction("apply"),
      tip: state.displayPatchApplied
        ? (state.lastDisplayPatchAt ? `${formatRelativeTime(state.lastDisplayPatchAt)}已生效` : "已生效")
        : "点击立即应用"
    },
    {
      label: "账号池",
      value: `${state.accountPool?.length || 0} 个`,
      ok: Boolean(state.accountPool?.length),
      action: () => onPage("accounts"),
      tip: state.remote?.lastError ? "上次同步出错" : (state.remote?.lastSyncAt ? `${formatRelativeTime(state.remote.lastSyncAt)}同步` : "点击查看账号池")
    },
    {
      label: "当前会话",
      value: state.session?.hasToken ? "已登录" : "访客",
      ok: Boolean(state.session?.hasToken),
      action: () => onAction("refresh"),
      tip: state.session?.nickname || state.session?.userId || "等待读取页面会话"
    },
    {
      label: "播放服务",
      value: latest ? "已就绪" : "等待记录",
      ok: Boolean(latest),
      action: () => onPage("playback"),
      tip: latest ? `最近：${latest.movieId || "视频"}` : "打开视频详情页即可记录"
    }
  ];

  const quickActions = [
    { icon: Sparkles, label: "应用覆盖", color: "from-pink-400 to-rose-400", run: () => onAction("apply") },
    { icon: RefreshCw, label: "同步账号", color: "from-purple-400 to-violet-400", run: () => onAction("sync-remote") },
    { icon: Play, label: "查看播放", color: "from-sky-400 to-blue-400", run: () => onPage("playback") },
    { icon: Download, label: "下载管理", color: "from-amber-400 to-orange-400", run: () => onPage("downloads") }
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-pink-400 via-purple-400 to-violet-500 p-5 text-white shadow-lg">
        <div className="absolute right-4 top-2 select-none text-6xl opacity-15 pointer-events-none">🍭</div>
        <p className="mb-0.5 text-[10px] font-medium opacity-70 uppercase tracking-wider">糖心志者 · 控制台</p>
        <h2 className="mb-0.5 text-xl font-bold">
          {state.session?.nickname ? `你好，${state.session.nickname} 👋` : "你好，欢迎回来 👋"}
        </h2>
        <p className="text-[11px] opacity-60 mb-3">
          {state.session?.userId ? `ID ${state.session.userId}` : "等待读取当前页面会话"} · v2.3.0
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">账号 {state.accountPool?.length || 0}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">下载 {stats.total}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">播放 {state.fullDetails?.length || 0}</span>
          {state.displayPatchApplied && (
            <span className="rounded-full bg-emerald-400/30 border border-white/25 px-3 py-1 font-medium">✓ 展示覆盖</span>
          )}
        </div>
        {latest?.playLink && (
          <button
            onClick={() => onAction("copy-full-link")}
            className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 px-3 py-1.5 text-[11px] font-medium backdrop-blur transition-all"
          >
            <Copy size={11} /> 复制最新播放链接
          </button>
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-700">
          <Star size={14} className="text-pink-500" /> 当前状态
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {statusItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="flex items-center gap-2 rounded-2xl border border-pink-100 bg-white p-3 shadow-sm text-left transition-all hover:border-pink-200 hover:shadow-md active:scale-95"
            >
              {item.ok ? <CheckCircle size={16} className="shrink-0 text-emerald-400" /> : <AlertCircle size={16} className="shrink-0 text-rose-400" />}
              <div className="min-w-0">
                <p className="text-[10px] text-purple-400">{item.label}</p>
                <p className="truncate text-xs font-semibold text-purple-800">{item.value}</p>
                <p className="truncate text-[9px] text-purple-300 mt-0.5">{item.tip}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-700">
          <Zap size={14} className="text-amber-500" /> 快捷操作
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((item) => (
            <button
              key={item.label}
              onClick={item.run}
              className={`bg-gradient-to-br ${item.color} rounded-2xl p-3 flex flex-col items-center gap-1.5 text-white shadow-md active:scale-95 transition-transform`}
            >
              <item.icon size={20} />
              <span className="text-center text-[10px] font-medium leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-purple-700">
          <TrendingUp size={14} className="text-sky-500" /> 最近流程
        </h3>
        <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
          {flow.length ? flow.map((item, index) => {
            const dotColor = item.level === "ok" ? "bg-emerald-400" : item.level === "error" ? "bg-rose-400" : item.level === "running" ? "bg-amber-400 animate-pulse" : "bg-purple-300";
            return (
              <div key={`${item.title}-${item.ts}-${index}`} className={`flex items-start gap-2 px-3 py-2.5 ${index < flow.length - 1 ? "border-b border-pink-50" : ""}`}>
                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                <span className="shrink-0 pt-0.5 text-[10px] text-purple-300">{shortTime(item.ts)}</span>
                <span className="text-xs leading-relaxed text-purple-700">{flowItemText(item)}</span>
              </div>
            );
          }) : (
            <div className="px-3 py-4 text-xs text-purple-400">等待页面操作、账号池轮换和下载进度记录。</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3 shadow-sm flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] text-purple-400">当前选中账号</p>
          <p className="truncate text-xs font-semibold text-purple-700 mt-0.5">
            {selected ? accountName(selected) : state.session?.nickname || "未选择账号池账号"}
          </p>
        </div>
        <button onClick={() => onPage("accounts")} className="shrink-0 ml-2 rounded-full bg-pink-50 hover:bg-pink-100 px-3 py-1 text-[10px] text-pink-500 transition-colors">
          查看
        </button>
      </div>
    </div>
  );
}
