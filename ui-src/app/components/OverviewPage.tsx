import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle,
  Cloud,
  Copy,
  Download,
  Film,
  Heart,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap
} from "lucide-react";
import type { BridgeState, Page } from "../types";
import {
  accountName,
  downloadProgress,
  downloadStats,
  downloadTasks,
  downloadTitle,
  flowItemText,
  formatRelativeTime,
  latestFullDetail,
  isRunningDownloadTask,
  selectedAccount,
  shortTime
} from "../helpers";
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

type ChecklistItem = {
  label: string;
  value: string;
  tip: string;
  ok: boolean;
  tone: string;
  onClick: () => void;
};

export function OverviewPage({ state, onAction, onPage }: Props) {
  const tasks = downloadTasks(state);
  const stats = downloadStats(tasks);
  const latest = latestFullDetail(state);
  const selected = selectedAccount(state);
  const flow = (state.flow || []).slice(-7).reverse();
  const currentTask = tasks.find(isRunningDownloadTask);
  const nickname = state.session?.nickname || "朋友";
  const remoteReady = Boolean(state.remote?.lastSyncAt && !state.remote?.lastError);
  const healthyCount = [state.displayPatchApplied, state.accountPool?.length, state.session?.hasToken, latest]
    .filter(Boolean).length;
  const alerts = [...(state.experience?.alerts || [])].filter((item) => !item.readAt).reverse();

  const checklist: ChecklistItem[] = [
    {
      label: "展示魔法",
      value: state.displayPatchApplied ? "已经亮起来啦" : "等待轻轻一点",
      ok: Boolean(state.displayPatchApplied),
      tip: state.displayPatchApplied
        ? (state.lastDisplayPatchAt ? `${formatRelativeTime(state.lastDisplayPatchAt)}重新确认` : "VIP、余额与尤物圈展示已覆盖")
        : "应用后会刷新会员与余额展示",
      tone: "bg-brand-50 text-brand-600",
      onClick: () => onAction("apply")
    },
    {
      label: "账号伙伴",
      value: `${state.accountPool?.length || 0} 位已入住`,
      ok: Boolean(state.accountPool?.length) && !state.remote?.lastError,
      tip: state.remote?.lastError
        ? "上次同步没有成功，去账号小屋看看"
        : state.remote?.lastSyncAt
          ? `${formatRelativeTime(state.remote.lastSyncAt)}同步`
          : "还没有进行首次云端同步",
      tone: "bg-success-50 text-success-600",
      onClick: () => onPage("accounts")
    },
    {
      label: "当前会话",
      value: state.session?.hasToken ? "已认出你" : "访客散步中",
      ok: Boolean(state.session?.hasToken),
      tip: state.session?.nickname || state.session?.userId || "等待页面登录信息",
      tone: "bg-[#f2efff] text-[#7764c8]",
      onClick: () => onAction("refresh")
    },
    {
      label: "放映准备",
      value: latest ? "片子已就位" : "等待新影片",
      ok: Boolean(latest),
      tip: latest ? `最近：${latest.movieTitle || latest.movieId || "视频"}` : "进入视频详情页后会自动准备资源",
      tone: "bg-info-50 text-info-600",
      onClick: () => onPage("playback")
    }
  ];

  return (
    <PageShell>
      <HeroBanner
        eyebrow={`CANDY DESK · ${APP_VERSION_LABEL}`}
        title={`${nickname}，今天也辛苦啦`}
        subtitle={healthyCount === 4
          ? "四项核心服务都在好好工作，可以安心开始播放。"
          : `已有 ${healthyCount}/4 项准备完成；下面的今日清单会告诉你下一步。`}
        emoji={healthyCount === 4 ? "♡" : "!"}
        badges={
          <>
            <Pill className="bg-white/75 text-slate-600">账号 {state.accountPool?.length || 0}</Pill>
            <Pill className="bg-white/75 text-info-600">放映 {state.fullDetails?.length || 0}</Pill>
            <Pill className="bg-white/75 text-warning-600">收纳 {stats.total}</Pill>
            <Pill className={remoteReady ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>
              <Cloud size={10} /> {remoteReady ? "云端好心情" : "云端待同步"}
            </Pill>
          </>
        }
        actions={
          <>
            {latest ? (
              <SoftButton size="sm" icon={Play} onClick={() => onPage("playback")}>继续放映</SoftButton>
            ) : (
              <SoftButton size="sm" icon={Sparkles} onClick={() => onAction("apply")}>完成今日准备</SoftButton>
            )}
            <SoftButton variant="soft" size="sm" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步账号</SoftButton>
          </>
        }
      />

      <StatGrid
        items={[
          { label: "账号伙伴", value: state.accountPool?.length || 0, tone: "pink", onClick: () => onPage("accounts") },
          { label: "放映记录", value: state.fullDetails?.length || 0, tone: "purple", onClick: () => onPage("playback") },
          { label: "收纳任务", value: stats.total, tone: "amber", onClick: () => onPage("downloads") },
          { label: stats.running ? "正在收纳" : "一切清爽", value: stats.running, tone: stats.running ? "sky" : "emerald", onClick: () => onPage("downloads") }
        ]}
      />

      <SectionCard title="待处理事项" icon={Bell} hint="下载、空间和账号自动化产生的本地提醒" action={<div className="flex items-center gap-2"><Pill className={alerts.length ? "bg-danger-50 text-danger-600" : "bg-success-50 text-success-600"}>{alerts.length ? `${alerts.length} 条未读` : "全部清爽"}</Pill>{alerts.length > 0 && <SoftButton size="xs" variant="ghost" onClick={() => onAction("clear-experience-alerts")}>全部清除</SoftButton>}</div>}>
        {alerts.length ? <div className="space-y-2">{alerts.slice(0, 5).map((alert) => (
          <div key={alert.id} className={`flex items-start gap-3 rounded-xl border p-3 ${alert.level === "error" ? "border-danger-100 bg-danger-50/70" : alert.level === "warning" ? "border-warning-100 bg-warning-50/70" : "border-info-100 bg-info-50/60"}`}>
            <button type="button" onClick={() => onPage(alert.category === "account" ? "accounts" : alert.category === "download" || alert.category === "storage" ? "downloads" : "overview")} className="min-w-0 flex-1 text-left"><strong className="block text-[11px] text-slate-800">{alert.title}{Number(alert.count || 1) > 1 ? `（${alert.count} 次）` : ""}</strong><span className="mt-1 block break-words text-[10px] leading-5 text-slate-500">{alert.detail}</span></button>
            <button type="button" onClick={() => onAction("mark-experience-alert", { alertId: alert.id })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm" aria-label={`将“${alert.title}”标为已读`}><X size={13} /></button>
          </div>
        ))}</div> : <p className="rounded-xl bg-success-50 px-4 py-5 text-center text-[11px] font-semibold text-success-600">糖糖没有发现需要你处理的事情</p>}
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-4">
          <SectionCard
            title="今日运行清单"
            icon={Heart}
            hint={`${healthyCount}/4 项状态良好；点任一项即可前往处理`}
            action={<Pill className={healthyCount === 4 ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>{healthyCount === 4 ? "全部完成" : `${4 - healthyCount} 项待看`}</Pill>}
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              {checklist.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="group flex min-h-[6.8rem] items-start gap-3 rounded-[1.35rem] border border-slate-200 bg-white/75 p-3.5 text-left shadow-[0_5px_16px_rgba(115,63,88,0.04)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white hover:shadow-md active:translate-y-0"
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 rotate-[-3deg] items-center justify-center rounded-[0.95rem] border border-white shadow-sm ${item.ok ? item.tone : "bg-warning-50 text-warning-600"}`}>
                    {item.ok ? <CheckCircle size={17} /> : <AlertCircle size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-slate-500">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[14px] font-extrabold text-slate-900">{item.value}</span>
                    <span className="mt-1 block line-clamp-2 text-[11px] font-medium leading-[1.55] text-slate-500">{item.tip}</span>
                  </span>
                  <ArrowRight size={13} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="糖糖的小日记" icon={TrendingUp} hint="最近七条页面、账号与下载动态" action={<Pill className="bg-slate-100 text-slate-600">{flow.length} 条</Pill>}>
            <div className="relative overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white/78 px-3.5">
              {flow.length ? flow.map((item, index) => {
                const level = item.level || "info";
                const dot = level === "ok" ? "bg-success-500" : level === "error" ? "bg-danger-500" : level === "running" ? "bg-warning-500 animate-pulse" : "bg-info-500";
                return (
                  <div key={`${item.title}-${item.ts}-${index}`} className={`relative flex items-start gap-3 py-3 ${index < flow.length - 1 ? "border-b border-slate-100" : ""}`}>
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white ring-2 ring-slate-100 ${dot}`} />
                    <span className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{shortTime(item.ts)}</span>
                    <span className="min-w-0 flex-1 text-[12px] font-medium leading-[1.55] text-slate-700">{flowItemText(item)}</span>
                  </div>
                );
              }) : <div className="px-4 py-8 text-center text-[12px] font-medium text-slate-500">日记还是空白，完成一次操作后就会留下记录</div>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="从这里开始" icon={Sparkles} hint="常用动作已经放在手边">
            <QuickActionGrid
              items={[
                { icon: Sparkles, label: "应用展示", tone: "pink", onClick: () => onAction("apply") },
                { icon: RefreshCw, label: "同步账号", tone: "emerald", onClick: () => onAction("sync-remote") },
                { icon: Play, label: "进入放映室", tone: "purple", onClick: () => onPage("playback") },
                { icon: Download, label: "查看收纳篮", tone: "amber", onClick: () => onPage("downloads") }
              ]}
            />
          </SectionCard>

          <SectionCard title="正在进行" icon={Zap} hint={currentTask ? "最近的下载与保存进度" : latest ? "最近准备好的影片" : "有任务时会出现在这里"} tone={currentTask ? "amber" : "sky"}>
            {currentTask ? (
              <button type="button" onClick={() => onPage("downloads")} className="group w-full rounded-[1.25rem] border border-warning-100 bg-warning-50/70 p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-900">{downloadTitle(currentTask)}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">{currentTask.stage === "error" ? "需要处理失败原因" : "正在收纳到下载篮"}</p>
                  </div>
                  <span className="text-lg font-extrabold tabular-nums text-warning-600">{downloadProgress(currentTask)}%</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-white bg-white/80 p-0.5">
                  <div className="h-full rounded-full bg-gradient-to-r from-warning-500 to-brand-400 transition-all" style={{ width: `${downloadProgress(currentTask)}%` }} />
                </div>
              </button>
            ) : latest ? (
              <div className="rounded-[1.25rem] border border-info-100 bg-info-50/70 p-3.5">
                <p className="truncate text-[13px] font-bold text-slate-900">{latest.movieTitle || latest.movieId || "最近影片"}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">资源已经准备好，可以继续放映或复制链接。</p>
                <div className="mt-3 flex gap-2">
                  <SoftButton size="sm" className="flex-1" icon={Film} onClick={() => onPage("playback")}>继续放映</SoftButton>
                  <SoftButton size="sm" variant="secondary" icon={Copy} title="复制最新播放链接" onClick={() => onAction("copy-full-link")} />
                </div>
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-info-100 bg-info-50/45 p-5 text-center">
                <Film size={21} className="mx-auto text-info-500" />
                <p className="mt-2 text-[12px] font-bold text-slate-700">等待一部新影片</p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">打开网站视频详情页后会自动出现在这里</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="今日账号伙伴" icon={Users} hint="播放请求会按当前来源策略自动挑选">
            <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-brand-100 bg-gradient-to-r from-brand-50/80 to-[#f3f0ff]/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 rotate-[-3deg] items-center justify-center rounded-[1rem] border-2 border-white bg-brand-500 text-[15px] font-extrabold text-white shadow-[0_7px_15px_rgba(220,72,110,0.2)]">
                  {(selected ? accountName(selected) : state.session?.nickname || "糖").slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-slate-900">{selected ? accountName(selected) : state.session?.nickname || "还没有选择账号"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <StatusDot ok={Boolean(selected || state.session?.hasToken)} />
                    {selected ? "账号池伙伴可用" : state.session?.hasToken ? "正在使用页面会话" : "建议先同步云端账号"}
                  </p>
                </div>
              </div>
              <SoftButton size="sm" variant="secondary" onClick={() => onPage("accounts")}>去看看</SoftButton>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
