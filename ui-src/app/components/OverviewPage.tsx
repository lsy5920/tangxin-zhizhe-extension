import { AlertCircle, CheckCircle, Copy, Download, Play, RefreshCw, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import type { BridgeState, Page } from "../types";
import { accountName, downloadStats, downloadTasks, flowItemText, formatRelativeTime, latestFullDetail, selectedAccount, shortTime } from "../helpers";
import { APP_VERSION_LABEL } from "../constants";
import {
  HeroBanner,
  PageShell,
  Pill,
  QuickActionGrid,
  SectionCard,
  SoftButton,
  StatGrid,
  StatusDot
} from "./ui/primitives";

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
  const flow = (state.flow || []).slice(-8).reverse();
  const greeting = state.session?.nickname ? `你好，${state.session.nickname}` : "你好，欢迎回来";

  const statusItems = [
    {
      label: "展示覆盖",
      value: state.displayPatchApplied ? "已生效" : "待应用",
      ok: Boolean(state.displayPatchApplied),
      tip: state.displayPatchApplied
        ? (state.lastDisplayPatchAt ? `${formatRelativeTime(state.lastDisplayPatchAt)}生效` : "VIP / 余额已覆盖")
        : "一键应用展示特权",
      action: () => onAction("apply")
    },
    {
      label: "账号池",
      value: `${state.accountPool?.length || 0} 个`,
      ok: Boolean(state.accountPool?.length),
      tip: state.remote?.lastError ? "上次同步出错" : (state.remote?.lastSyncAt ? `${formatRelativeTime(state.remote.lastSyncAt)}同步` : "前往管理账号"),
      action: () => onPage("accounts")
    },
    {
      label: "当前会话",
      value: state.session?.hasToken ? "已登录" : "访客",
      ok: Boolean(state.session?.hasToken),
      tip: state.session?.nickname || state.session?.userId || "等待读取页面会话",
      action: () => onAction("refresh")
    },
    {
      label: "播放服务",
      value: latest ? "已就绪" : "等待记录",
      ok: Boolean(latest),
      tip: latest ? `最近：${latest.movieTitle || latest.movieId || "视频"}` : "打开详情页自动记录",
      action: () => onPage("playback")
    }
  ];

  return (
    <PageShell>
      <HeroBanner
        eyebrow={`糖心志者 · ${APP_VERSION_LABEL}`}
        title={`${greeting} 👋`}
        subtitle={state.session?.userId ? `用户 ID ${state.session.userId} · 控制台已就绪` : "等待读取当前页面会话 · 可先同步账号池"}
        badges={
          <>
            <Pill className="bg-white/20 text-white backdrop-blur">账号 {state.accountPool?.length || 0}</Pill>
            <Pill className="bg-white/20 text-white backdrop-blur">下载 {stats.total}</Pill>
            <Pill className="bg-white/20 text-white backdrop-blur">播放 {state.fullDetails?.length || 0}</Pill>
            {state.displayPatchApplied && <Pill className="border border-white/30 bg-emerald-400/25 text-white">展示覆盖 ✓</Pill>}
            {stats.running > 0 && <Pill className="border border-white/30 bg-amber-400/30 text-white">下载中 {stats.running}</Pill>}
          </>
        }
        actions={
          latest?.playLink ? (
            <SoftButton variant="soft" size="sm" icon={Copy} onClick={() => onAction("copy-full-link")}>
              复制完整链接
            </SoftButton>
          ) : undefined
        }
      />

      <StatGrid
        items={[
          { label: "账号", value: state.accountPool?.length || 0, tone: "purple", onClick: () => onPage("accounts") },
          { label: "播放", value: state.fullDetails?.length || 0, tone: "sky", onClick: () => onPage("playback") },
          { label: "下载", value: stats.total, tone: "amber", onClick: () => onPage("downloads") },
          { label: "进行中", value: stats.running, tone: stats.running ? "pink" : "emerald", onClick: () => onPage("downloads") }
        ]}
      />

      <SectionCard title="当前状态" icon={Zap} hint="点击卡片可直达对应功能">
        <div className="grid grid-cols-2 gap-2">
          {statusItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="group flex items-start gap-2.5 rounded-2xl border border-purple-50 bg-gradient-to-br from-white to-purple-50/40 p-3 text-left shadow-sm transition hover:border-pink-200 hover:shadow-md active:scale-[0.98]"
            >
              {item.ok ? (
                <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-purple-400">{item.label}</p>
                <p className="truncate text-xs font-bold text-purple-800">{item.value}</p>
                <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-purple-300">{item.tip}</p>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="快捷操作" icon={Sparkles} hint="常用动作一键完成">
        <QuickActionGrid
          items={[
            { icon: Sparkles, label: "应用覆盖", color: "from-pink-400 to-rose-500", onClick: () => onAction("apply") },
            { icon: RefreshCw, label: "同步账号", color: "from-purple-400 to-violet-500", onClick: () => onAction("sync-remote") },
            { icon: Play, label: "查看播放", color: "from-sky-400 to-blue-500", onClick: () => onPage("playback") },
            { icon: Download, label: "下载管理", color: "from-amber-400 to-orange-500", onClick: () => onPage("downloads") }
          ]}
        />
      </SectionCard>

      <SectionCard
        title="最近流程"
        icon={TrendingUp}
        hint="实时运行摘要"
        action={
          <Pill className="bg-purple-50 text-purple-400">{flow.length} 条</Pill>
        }
      >
        <div className="overflow-hidden rounded-xl border border-purple-50 bg-gradient-to-b from-purple-50/40 to-white">
          {flow.length ? flow.map((item, index) => {
            const level = item.level || "info";
            const dot =
              level === "ok" ? "bg-emerald-400"
                : level === "error" ? "bg-rose-400"
                  : level === "running" ? "bg-amber-400 animate-pulse"
                    : "bg-purple-300";
            return (
              <div
                key={`${item.title}-${item.ts}-${index}`}
                className={`flex items-start gap-2.5 px-3 py-2.5 ${index < flow.length - 1 ? "border-b border-purple-50/80" : ""}`}
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="w-10 shrink-0 pt-0.5 text-[10px] tabular-nums text-purple-300">{shortTime(item.ts)}</span>
                <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-purple-700">{flowItemText(item)}</span>
              </div>
            );
          }) : (
            <div className="px-3 py-5 text-center text-[11px] text-purple-400">等待页面操作、账号轮换和下载进度…</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="当前选中账号" icon={Users}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-purple-500 text-sm font-bold text-white shadow-sm">
              {(selected ? accountName(selected) : state.session?.nickname || "志").slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-purple-800">
                {selected ? accountName(selected) : state.session?.nickname || "未选择账号池账号"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-purple-400">
                <StatusDot ok={Boolean(selected || state.session?.hasToken)} />
                {selected ? "账号池可用" : state.session?.hasToken ? "页面会话中" : "建议同步云端账号"}
              </p>
            </div>
          </div>
          <SoftButton size="sm" variant="secondary" onClick={() => onPage("accounts")}>
            管理
          </SoftButton>
        </div>
      </SectionCard>
    </PageShell>
  );
}
