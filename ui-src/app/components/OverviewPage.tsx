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
        ? (state.lastDisplayPatchAt ? `${formatRelativeTime(state.lastDisplayPatchAt)}生效` : "VIP、余额与尤物圈展示已覆盖")
        : "点击应用展示特权",
      action: () => onAction("apply")
    },
    {
      label: "账号池",
      value: `${state.accountPool?.length || 0} 个账号`,
      ok: Boolean(state.accountPool?.length) && !state.remote?.lastError,
      tip: state.remote?.lastError ? "上次同步失败，点击排查" : (state.remote?.lastSyncAt ? `${formatRelativeTime(state.remote.lastSyncAt)}同步` : "尚未同步云端账号"),
      action: () => onPage("accounts")
    },
    {
      label: "当前会话",
      value: state.session?.hasToken ? "已识别登录" : "访客模式",
      ok: Boolean(state.session?.hasToken),
      tip: state.session?.nickname || state.session?.userId || "等待读取页面会话",
      action: () => onAction("refresh")
    },
    {
      label: "播放服务",
      value: latest ? "资源已就绪" : "等待视频",
      ok: Boolean(latest),
      tip: latest ? `最近：${latest.movieTitle || latest.movieId || "视频"}` : "打开视频详情页后自动获取",
      action: () => onPage("playback")
    }
  ];

  return (
    <PageShell>
      <HeroBanner
        eyebrow={`糖心志者 · ${APP_VERSION_LABEL}`}
        title={greeting}
        subtitle={state.session?.userId ? `用户 ID ${state.session.userId} · 所有核心服务可在此快速进入` : "控制台已就绪；同步账号池后可获得完整播放能力"}
        emoji="✦"
        badges={
          <>
            <Pill className="border border-white/10 bg-white/10 text-white">账号 {state.accountPool?.length || 0}</Pill>
            <Pill className="border border-white/10 bg-white/10 text-white">播放 {state.fullDetails?.length || 0}</Pill>
            <Pill className="border border-white/10 bg-white/10 text-white">下载 {stats.total}</Pill>
            {state.displayPatchApplied && <Pill className="border border-success-500/30 bg-success-500/20 text-white">展示覆盖已生效</Pill>}
            {stats.running > 0 && <Pill className="border border-warning-500/30 bg-warning-500/20 text-white">{stats.running} 个任务进行中</Pill>}
          </>
        }
        actions={latest?.playLink ? (
          <SoftButton variant="soft" size="sm" icon={Copy} onClick={() => onAction("copy-full-link")}>复制最新播放链接</SoftButton>
        ) : undefined}
      />

      <StatGrid
        items={[
          { label: "账号总数", value: state.accountPool?.length || 0, tone: "purple", onClick: () => onPage("accounts") },
          { label: "播放记录", value: state.fullDetails?.length || 0, tone: "sky", onClick: () => onPage("playback") },
          { label: "下载任务", value: stats.total, tone: "amber", onClick: () => onPage("downloads") },
          { label: "正在进行", value: stats.running, tone: stats.running ? "pink" : "emerald", onClick: () => onPage("downloads") }
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <SectionCard title="运行状态" icon={Zap} hint="状态、风险和下一步操作集中展示">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {statusItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="group flex min-h-[6.5rem] items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-left transition hover:border-brand-200 hover:bg-white hover:shadow-md active:scale-[0.99]"
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.ok ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
                    {item.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-slate-500">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-slate-900">{item.value}</span>
                    <span className="mt-1 block line-clamp-2 text-[11px] leading-[1.55] text-slate-500">{item.tip}</span>
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="最近流程" icon={TrendingUp} hint="只保留最近八条关键运行信息" action={<Pill className="bg-slate-100 text-slate-600">{flow.length} 条</Pill>}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {flow.length ? flow.map((item, index) => {
                const level = item.level || "info";
                const dot = level === "ok" ? "bg-success-500" : level === "error" ? "bg-danger-500" : level === "running" ? "bg-warning-500 animate-pulse" : "bg-info-500";
                return (
                  <div key={`${item.title}-${item.ts}-${index}`} className={`flex items-start gap-3 px-3.5 py-3 ${index < flow.length - 1 ? "border-b border-slate-100" : ""}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <span className="w-10 shrink-0 text-[11px] tabular-nums text-slate-400">{shortTime(item.ts)}</span>
                    <span className="min-w-0 flex-1 text-[12px] leading-[1.55] text-slate-700">{flowItemText(item)}</span>
                  </div>
                );
              }) : <div className="px-4 py-8 text-center text-[12px] text-slate-500">等待页面操作、账号轮换和下载进度</div>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="快捷操作" icon={Sparkles} hint="常用动作一键完成">
            <QuickActionGrid
              items={[
                { icon: Sparkles, label: "应用覆盖", tone: "purple", onClick: () => onAction("apply") },
                { icon: RefreshCw, label: "同步账号", tone: "emerald", onClick: () => onAction("sync-remote") },
                { icon: Play, label: "播放中心", tone: "sky", onClick: () => onPage("playback") },
                { icon: Download, label: "下载管理", tone: "amber", onClick: () => onPage("downloads") }
              ]}
            />
          </SectionCard>

          <SectionCard title="当前账号" icon={Users} hint="播放请求将优先按账号来源策略自动选择">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-[15px] font-bold text-white">
                  {(selected ? accountName(selected) : state.session?.nickname || "志").slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{selected ? accountName(selected) : state.session?.nickname || "未选择账号池账号"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <StatusDot ok={Boolean(selected || state.session?.hasToken)} />
                    {selected ? "账号池可用" : state.session?.hasToken ? "正在使用页面会话" : "建议同步云端账号"}
                  </p>
                </div>
              </div>
              <SoftButton size="sm" variant="secondary" onClick={() => onPage("accounts")}>管理</SoftButton>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
