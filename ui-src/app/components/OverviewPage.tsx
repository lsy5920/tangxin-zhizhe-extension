import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle,
  Clapperboard,
  Cloud,
  Download,
  Heart,
  RefreshCw,
  Settings,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";
import type { BridgeState, Page } from "../types";
import {
  downloadStats,
  downloadTasks,
  flowItemText,
  formatRelativeTime,
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
  const nickname = state.session?.nickname || "朋友";
  const remoteReady = Boolean(state.remote?.lastSyncAt && !state.remote?.lastError);
  const libraryCount = Object.keys(state.experience?.library || {}).length;
  const bookmarkCount = Object.values(state.experience?.bookmarks || {}).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
  const historyCount = state.screening?.history?.length || 0;
  const flow = (state.flow || []).slice(-6).reverse();
  const alerts = [...(state.experience?.alerts || [])].filter((item) => !item.readAt).reverse();
  const healthyCount = [
    state.displayPatchApplied,
    state.accountPool?.length,
    state.session?.hasToken,
    !state.remote?.lastError
  ].filter(Boolean).length;

  const openCinema = (route: string = "home") => onAction("open-cinema-page", { route });
  const checklist: ChecklistItem[] = [
    {
      label: "页面集成",
      value: state.displayPatchApplied ? "运行正常" : "等待应用",
      ok: Boolean(state.displayPatchApplied),
      tip: state.displayPatchApplied
        ? (state.lastDisplayPatchAt ? `${formatRelativeTime(state.lastDisplayPatchAt)}确认` : "目标页面增强已启用")
        : "应用后刷新页面展示与广告清理",
      tone: "bg-brand-50 text-brand-600",
      onClick: () => onAction("apply")
    },
    {
      label: "账号服务",
      value: `${state.accountPool?.length || 0} 个账号`,
      ok: Boolean(state.accountPool?.length) && !state.remote?.lastError,
      tip: state.remote?.lastError
        ? "上次同步失败，请到账号小屋处理"
        : state.remote?.lastSyncAt
          ? `${formatRelativeTime(state.remote.lastSyncAt)}同步`
          : "等待首次同步",
      tone: "bg-success-50 text-success-600",
      onClick: () => onPage("accounts")
    },
    {
      label: "页面会话",
      value: state.session?.hasToken ? "已经连接" : "访客模式",
      ok: Boolean(state.session?.hasToken),
      tip: state.session?.nickname || state.session?.userId || "可使用账号池进入影院检票",
      tone: "bg-[#f2efff] text-[#7764c8]",
      onClick: () => onAction("refresh")
    },
    {
      label: "影院服务",
      value: stats.running ? `${stats.running} 个任务进行中` : "可以开映",
      ok: !tasks.some((task) => task.stage === "error"),
      tip: `${libraryCount} 部片库 · ${bookmarkCount} 条书签 · ${historyCount} 条足迹`,
      tone: "bg-info-50 text-info-600",
      onClick: () => openCinema(stats.running ? "downloads" : "home")
    }
  ];

  return (
    <PageShell>
      <HeroBanner
        eyebrow={`CANDY DESK · ${APP_VERSION_LABEL}`}
        title={`${nickname}，今日服务概览`}
        subtitle="插件面板现在只负责账号、系统与升级管理；观影、片库、书签、足迹、下载和存储统一进入独立糖心影院。"
        emoji={healthyCount === 4 ? "♡" : "!"}
        badges={
          <>
            <Pill className="bg-white/75 text-slate-600">账号 {state.accountPool?.length || 0}</Pill>
            <Pill className="bg-white/75 text-info-600">片库 {libraryCount}</Pill>
            <Pill className="bg-white/75 text-warning-600">影院任务 {stats.running}</Pill>
            <Pill className={remoteReady ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>
              <Cloud size={10} /> {remoteReady ? "云端正常" : "云端待处理"}
            </Pill>
          </>
        }
        actions={
          <>
            <SoftButton size="sm" icon={Clapperboard} onClick={() => openCinema("home")}>打开糖心影院</SoftButton>
            <SoftButton variant="soft" size="sm" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步账号</SoftButton>
          </>
        }
      />

      <StatGrid
        items={[
          { label: "账号伙伴", value: state.accountPool?.length || 0, tone: "pink", onClick: () => onPage("accounts") },
          { label: "我的片库", value: libraryCount, tone: "purple", onClick: () => openCinema("library") },
          { label: "播放书签", value: bookmarkCount, tone: "sky", onClick: () => openCinema("bookmarks") },
          { label: stats.running ? "影院任务" : "下载记录", value: stats.running || stats.total, tone: stats.running ? "amber" : "emerald", onClick: () => openCinema("downloads") }
        ]}
      />

      <SectionCard
        title="待处理事项"
        icon={Bell}
        hint="账号问题在面板处理；下载、空间和播放提醒进入影院对应页面"
        action={<div className="flex items-center gap-2"><Pill className={alerts.length ? "bg-danger-50 text-danger-600" : "bg-success-50 text-success-600"}>{alerts.length ? `${alerts.length} 条未读` : "全部正常"}</Pill>{alerts.length > 0 && <SoftButton size="xs" variant="ghost" onClick={() => onAction("clear-experience-alerts")}>全部清除</SoftButton>}</div>}
      >
        {alerts.length ? <div className="space-y-2">{alerts.slice(0, 5).map((alert) => {
          const cinemaRoute = alert.category === "download" ? "downloads" : alert.category === "storage" ? "storage" : "home";
          const openAlert = () => alert.category === "account" ? onPage("accounts") : openCinema(cinemaRoute);
          return (
            <div key={alert.id} className={`flex items-start gap-3 rounded-xl border p-3 ${alert.level === "error" ? "border-danger-100 bg-danger-50/70" : alert.level === "warning" ? "border-warning-100 bg-warning-50/70" : "border-info-100 bg-info-50/60"}`}>
              <button type="button" onClick={openAlert} className="min-w-0 flex-1 text-left"><strong className="block text-[11px] text-slate-800">{alert.title}{Number(alert.count || 1) > 1 ? `（${alert.count} 次）` : ""}</strong><span className="mt-1 block break-words text-[10px] leading-5 text-slate-500">{alert.detail}</span></button>
              <button type="button" onClick={() => onAction("mark-experience-alert", { alertId: alert.id })} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm" aria-label={`将“${alert.title}”标为已读`}><CheckCircle size={13} /></button>
            </div>
          );
        })}</div> : <p className="rounded-xl bg-success-50 px-4 py-5 text-center text-[11px] font-semibold text-success-600">当前没有需要处理的事项</p>}
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-4">
          <SectionCard
            title="今日运行清单"
            icon={Heart}
            hint={`${healthyCount}/4 项状态正常`}
            action={<Pill className={healthyCount === 4 ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>{healthyCount === 4 ? "全部正常" : `${4 - healthyCount} 项待处理`}</Pill>}
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              {checklist.map((item) => (
                <button key={item.label} type="button" onClick={item.onClick} className="group flex min-h-[6.8rem] items-start gap-3 rounded-[1.35rem] border border-slate-200 bg-white/75 p-3.5 text-left shadow-[0_5px_16px_rgba(115,63,88,0.04)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white hover:shadow-md">
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] border border-white shadow-sm ${item.ok ? item.tone : "bg-warning-50 text-warning-600"}`}>
                    {item.ok ? <CheckCircle size={17} /> : <AlertCircle size={17} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold text-slate-500">{item.label}</span><span className="mt-0.5 block truncate text-[14px] font-extrabold text-slate-900">{item.value}</span><span className="mt-1 block line-clamp-2 text-[11px] font-medium leading-[1.55] text-slate-500">{item.tip}</span></span>
                  <ArrowRight size={13} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="最近活动" icon={TrendingUp} hint="跨页面服务日志" action={<Pill className="bg-slate-100 text-slate-600">{flow.length} 条</Pill>}>
            <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white/78 px-3.5">
              {flow.length ? flow.map((item, index) => {
                const level = item.level || "info";
                const dot = level === "ok" ? "bg-success-500" : level === "error" ? "bg-danger-500" : level === "running" ? "bg-warning-500 animate-pulse" : "bg-info-500";
                return <div key={`${item.title}-${item.ts}-${index}`} className={`flex items-start gap-3 py-3 ${index < flow.length - 1 ? "border-b border-slate-100" : ""}`}><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white ring-2 ring-slate-100 ${dot}`} /><span className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{shortTime(item.ts)}</span><span className="min-w-0 flex-1 text-[12px] font-medium leading-[1.55] text-slate-700">{flowItemText(item)}</span></div>;
              }) : <div className="px-4 py-8 text-center text-[12px] font-medium text-slate-500">完成一次操作后会在这里留下记录</div>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="管理入口" icon={Sparkles} hint="面板只保留系统管理与影院启动">
            <QuickActionGrid items={[
              { icon: Clapperboard, label: "打开影院", tone: "purple", onClick: () => openCinema("home") },
              { icon: Users, label: "账号小屋", tone: "emerald", onClick: () => onPage("accounts") },
              { icon: Settings, label: "照料中心", tone: "pink", onClick: () => onPage("settings") },
              { icon: RefreshCw, label: "同步账号", tone: "amber", onClick: () => onAction("sync-remote") }
            ]} />
          </SectionCard>

          <SectionCard title="影院摘要" icon={Clapperboard} hint="完整操作在独立影院中完成" tone={stats.running ? "amber" : "sky"}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => openCinema("library")} className="rounded-2xl border border-violet-100 bg-violet-50/70 p-3 text-left"><Heart size={16} className="text-violet-500" /><strong className="mt-2 block text-[15px] text-slate-900">{libraryCount}</strong><span className="text-[10px] text-slate-500">片库影片</span></button>
              <button type="button" onClick={() => openCinema("bookmarks")} className="rounded-2xl border border-info-100 bg-info-50/70 p-3 text-left"><Sparkles size={16} className="text-info-500" /><strong className="mt-2 block text-[15px] text-slate-900">{bookmarkCount}</strong><span className="text-[10px] text-slate-500">时间书签</span></button>
              <button type="button" onClick={() => openCinema("history")} className="rounded-2xl border border-brand-100 bg-brand-50/70 p-3 text-left"><TrendingUp size={16} className="text-brand-500" /><strong className="mt-2 block text-[15px] text-slate-900">{historyCount}</strong><span className="text-[10px] text-slate-500">观看足迹</span></button>
              <button type="button" onClick={() => openCinema("downloads")} className="rounded-2xl border border-warning-100 bg-warning-50/70 p-3 text-left"><Download size={16} className="text-warning-600" /><strong className="mt-2 block text-[15px] text-slate-900">{stats.running || stats.total}</strong><span className="text-[10px] text-slate-500">{stats.running ? "进行中任务" : "下载记录"}</span></button>
            </div>
            <SoftButton className="mt-3 w-full" icon={Clapperboard} onClick={() => openCinema(stats.running ? "downloads" : "home")}>进入影院处理</SoftButton>
          </SectionCard>

          <SectionCard title="账号状态" icon={Users} hint="播放检票会按当前策略自动选择账号">
            <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-brand-100 bg-gradient-to-r from-brand-50/80 to-[#f3f0ff]/70 p-3.5">
              <div className="min-w-0"><p className="truncate text-[13px] font-bold text-slate-900">{state.accountPool?.length ? `${state.accountPool.length} 个账号可管理` : "还没有账号"}</p><p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><StatusDot ok={remoteReady} />{remoteReady ? "云端同步正常" : state.remote?.lastError || "等待首次同步"}</p></div>
              <SoftButton size="sm" variant="secondary" onClick={() => onPage("accounts")}>去看看</SoftButton>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
