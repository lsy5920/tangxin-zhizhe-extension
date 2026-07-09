import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Cloud, Coins, Crown, Edit2, Eye, EyeOff, HardDrive, Heart, Key, Plus, RefreshCw, ShieldCheck, Trash2, Upload, XCircle } from "lucide-react";
import type { AccountItem, AccountsPageIntent, BridgeState } from "../types";
import { accountAvailable, accountName, accountRights, accountStats, accountStatusLabel, formatRelativeTime, isCloudAccount, visibleAccounts } from "../helpers";
import {
  EmptyState,
  FieldLabel,
  ModalSheet,
  PageShell,
  Pill,
  SectionCard,
  SoftButton,
  SoftInput,
  SoftTextarea,
  StatGrid
} from "./ui/primitives";

type AddType = "password" | "qrcode" | "token";
type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  intent?: AccountsPageIntent;
};

const modeOptions = [
  { val: "cloud", label: "云端自动轮换", desc: "按金币升序自动选用" },
  { val: "local", label: "本地选中", desc: "只用本地选中账号" },
  { val: "cloud-first", label: "云端优先", desc: "云端失败再本地" }
];

function accountTypeText(type: AddType) {
  if (type === "password") return "账号密码";
  if (type === "qrcode") return "账号凭证";
  return "token / deviceId";
}

export function AccountsPage({ state, onAction, intent }: Props) {
  const [showInvalid, setShowInvalid] = useState(false);
  const [workerUrl, setWorkerUrl] = useState(state.remote?.baseUrl || "");
  const [sourceMode, setSourceMode] = useState(state.remote?.accountSourceMode || "cloud");
  const [addType, setAddType] = useState<AddType>("password");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [form, setForm] = useState({
    accountNickname: "",
    accountUsername: "",
    accountPassword: "",
    accountDeviceId: "",
    accountToken: "",
    accountQrcode: "",
    accountNotes: ""
  });

  const stats = accountStats(state);
  const accounts = useMemo(() => visibleAccounts(state, showInvalid), [state, showInvalid]);
  const cloudAccounts = accounts.filter(isCloudAccount);
  const localAccounts = accounts.filter((a) => !isCloudAccount(a));

  useEffect(() => {
    setWorkerUrl(state.remote?.baseUrl || "");
    setSourceMode(state.remote?.accountSourceMode || "cloud");
  }, [state.remote?.baseUrl, state.remote?.accountSourceMode]);

  useEffect(() => {
    if (typeof intent?.showInvalid === "boolean") setShowInvalid(intent.showInvalid);
    if (intent?.openAdd) setShowTypeSelect(true);
  }, [intent?.showInvalid, intent?.openAdd]);

  const saveRemote = () => onAction("save-remote", { remoteBaseUrl: workerUrl, accountSourceMode: sourceMode });

  const submitAccount = (upload: boolean) => {
    onAction(upload ? "upload-account-remote" : "save-account", { ...form, accountCredentialMode: addType });
    setShowAddModal(false);
  };

  const chooseType = (type: AddType) => {
    setAddType(type);
    setShowTypeSelect(false);
    setShowAddModal(true);
  };

  const renderAccount = (account: AccountItem) => {
    const cloud = isCloudAccount(account);
    const ok = accountAvailable(account);
    const selected = account.id && account.id === state.selectedFullAccountId;
    const rights = accountRights(account);
    const lastVerified = (account as unknown as { lastVerifiedAt?: string }).lastVerifiedAt;
    const tokenMasked = account.tokenMasked || "";

    return (
      <div
        key={account.id || accountName(account)}
        className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
          selected ? "border-pink-300 ring-2 ring-pink-100" : ok ? "border-purple-50" : "border-rose-100 opacity-80"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm ${ok ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-slate-300"}`}>
              {accountName(account).slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-purple-800">{accountName(account)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected && <Pill className="bg-pink-100 text-pink-600">已选中</Pill>}
                {cloud && <Pill className="bg-sky-100 text-sky-600">云端</Pill>}
                <Pill className={ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}>{accountStatusLabel(account)}</Pill>
              </div>
            </div>
          </div>
          {ok ? <CheckCircle size={16} className="mt-1 shrink-0 text-emerald-400" /> : <XCircle size={16} className="mt-1 shrink-0 text-rose-400" />}
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <div className="rounded-xl bg-amber-50 px-2 py-1.5 text-center">
            <Crown size={11} className={`mx-auto ${rights.vip ? "text-amber-500" : "text-slate-300"}`} />
            <p className="mt-0.5 text-[9px] font-medium text-purple-500">{rights.vip ? "VIP" : "无 VIP"}</p>
          </div>
          <div className="rounded-xl bg-pink-50 px-2 py-1.5 text-center">
            <Heart size={11} className={`mx-auto ${rights.dark ? "text-pink-500" : "text-slate-300"}`} />
            <p className="mt-0.5 text-[9px] font-medium text-purple-500">{rights.dark ? "尤物圈" : "未开通"}</p>
          </div>
          <div className="rounded-xl bg-orange-50 px-2 py-1.5 text-center">
            <Coins size={11} className="mx-auto text-amber-500" />
            <p className="mt-0.5 truncate text-[9px] font-medium text-purple-500">
              {rights.coins !== undefined && rights.coins !== null ? rights.coins : "?"} 币
            </p>
          </div>
        </div>

        {cloud && (tokenMasked || lastVerified) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-purple-300">
            {tokenMasked && <span className="flex items-center gap-0.5"><Key size={9} />{tokenMasked}</span>}
            {lastVerified && <span className="flex items-center gap-0.5"><ShieldCheck size={9} className="text-emerald-400" />{formatRelativeTime(lastVerified)}</span>}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
          <SoftButton size="xs" variant="sky" icon={ShieldCheck} onClick={() => onAction("verify-account", { accountId: account.id || "" })}>
            检查
          </SoftButton>
          {!cloud && (
            <>
              <SoftButton
                size="xs"
                variant={selected ? "primary" : "secondary"}
                onClick={() => onAction("select-account", { accountId: account.id || "" })}
              >
                {selected ? "已选" : "选择"}
              </SoftButton>
              <SoftButton size="xs" variant="ghost" icon={Upload} title="上传至云端" onClick={() => onAction("upload-local-account-remote", { accountId: account.id || "" })} />
              <SoftButton size="xs" variant="ghost" icon={Edit2} title="编辑" onClick={() => onAction("edit-account", { accountId: account.id || "" })} />
              <SoftButton size="xs" variant="danger" icon={Trash2} title="删除" onClick={() => onAction("remove-account", { accountId: account.id || "" })} />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <PageShell>
      <StatGrid
        items={[
          { label: "全部", value: stats.total, tone: "purple" },
          { label: "云端可用", value: stats.cloudAvailable, tone: "emerald" },
          { label: "本地", value: stats.local, tone: "sky" },
          { label: "失效", value: stats.invalid, tone: "rose" }
        ]}
      />

      <SectionCard title="远程配置" icon={Cloud} hint="配置云端服务地址与账号来源策略" tone="sky">
        <div className="space-y-3">
          <div>
            <FieldLabel>云端服务地址</FieldLabel>
            <SoftInput
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
              placeholder="https://txzzsecure.lsy20.top"
            />
          </div>
          <div>
            <FieldLabel>账号来源模式</FieldLabel>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {modeOptions.map((mode) => {
                const active = sourceMode === mode.val;
                return (
                  <button
                    key={mode.val}
                    type="button"
                    onClick={() => setSourceMode(mode.val)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-transparent bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow-md"
                        : "border-pink-100 bg-white text-purple-600 hover:bg-purple-50"
                    }`}
                  >
                    <p className="text-[11px] font-bold">{mode.label}</p>
                    <p className={`mt-0.5 text-[9px] ${active ? "text-white/75" : "text-purple-300"}`}>{mode.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton className="w-full" onClick={saveRemote}>保存配置</SoftButton>
            <SoftButton className="w-full" variant="sky" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步云端</SoftButton>
          </div>
          {state.remote?.lastSyncAt && (
            <p className="text-[10px] text-purple-300">上次同步：{formatRelativeTime(state.remote.lastSyncAt)}</p>
          )}
          {state.remote?.lastError && (
            <p className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-[10px] text-rose-500">{state.remote.lastError}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="云端账号"
        icon={Cloud}
        hint="只读轮换账号，不可手动删除"
        action={
          <SoftButton size="xs" variant="ghost" icon={showInvalid ? EyeOff : Eye} onClick={() => setShowInvalid((v) => !v)}>
            {showInvalid ? "隐藏失效" : "查看失效"}
          </SoftButton>
        }
      >
        <div className="space-y-2">
          {cloudAccounts.length ? cloudAccounts.map(renderAccount) : (
            <EmptyState
              icon={Cloud}
              title="暂无云端账号"
              desc="请先保存云端服务地址并点击「同步云端」。"
              action={<SoftButton size="sm" variant="sky" icon={RefreshCw} onClick={() => onAction("sync-remote")}>立即同步</SoftButton>}
            />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="本地账号"
        icon={HardDrive}
        hint="可手动添加、选择、上传与删除"
        action={
          <SoftButton size="xs" icon={Plus} onClick={() => setShowTypeSelect(true)}>
            添加
          </SoftButton>
        }
      >
        <div className="space-y-2">
          {localAccounts.length ? localAccounts.map(renderAccount) : (
            <EmptyState
              icon={HardDrive}
              title="暂无本地账号"
              desc="可添加账号密码、凭证或 token。"
              action={<SoftButton size="sm" icon={Plus} onClick={() => setShowTypeSelect(true)}>添加账号</SoftButton>}
            />
          )}
        </div>
      </SectionCard>

      <ModalSheet open={showTypeSelect} onClose={() => setShowTypeSelect(false)} title="选择账号类型">
        <div className="space-y-2">
          {([
            { type: "password" as AddType, label: "账号密码", desc: "使用用户名和密码登录" },
            { type: "qrcode" as AddType, label: "账号凭证", desc: "使用账号凭证字符串" },
            { type: "token" as AddType, label: "token / deviceId", desc: "使用 token 和 deviceId" }
          ]).map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => chooseType(item.type)}
              className="w-full rounded-2xl border border-pink-100 bg-gradient-to-r from-pink-50 to-purple-50 p-3.5 text-left transition hover:from-pink-100 hover:to-purple-100 active:scale-[0.99]"
            >
              <p className="text-sm font-bold text-purple-800">{item.label}</p>
              <p className="mt-0.5 text-[11px] text-purple-400">{item.desc}</p>
            </button>
          ))}
        </div>
      </ModalSheet>

      <ModalSheet
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={accountTypeText(addType)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => submitAccount(false)}>保存本地</SoftButton>
            <SoftButton className="w-full" icon={Upload} onClick={() => submitAccount(true)}>保存并上传</SoftButton>
          </div>
        }
      >
        <div className="space-y-2.5">
          <div>
            <FieldLabel>账号昵称</FieldLabel>
            <SoftInput placeholder="显示名称" value={form.accountNickname} onChange={(e) => setForm({ ...form, accountNickname: e.target.value })} />
          </div>
          {addType === "password" && (
            <>
              <div>
                <FieldLabel>用户名</FieldLabel>
                <SoftInput placeholder="登录用户名" value={form.accountUsername} onChange={(e) => setForm({ ...form, accountUsername: e.target.value })} />
              </div>
              <div>
                <FieldLabel>密码</FieldLabel>
                <SoftInput type="password" placeholder="登录密码" value={form.accountPassword} onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} />
              </div>
            </>
          )}
          {addType === "qrcode" && (
            <div>
              <FieldLabel>账号凭证</FieldLabel>
              <SoftTextarea rows={3} placeholder="粘贴凭证内容" value={form.accountQrcode} onChange={(e) => setForm({ ...form, accountQrcode: e.target.value })} />
            </div>
          )}
          {addType === "token" && (
            <>
              <div>
                <FieldLabel>deviceId</FieldLabel>
                <SoftInput placeholder="设备 ID" value={form.accountDeviceId} onChange={(e) => setForm({ ...form, accountDeviceId: e.target.value })} />
              </div>
              <div>
                <FieldLabel>userToken</FieldLabel>
                <SoftInput placeholder="用户 token" value={form.accountToken} onChange={(e) => setForm({ ...form, accountToken: e.target.value })} />
              </div>
            </>
          )}
          <div>
            <FieldLabel>备注（可选）</FieldLabel>
            <SoftInput placeholder="备注说明" value={form.accountNotes} onChange={(e) => setForm({ ...form, accountNotes: e.target.value })} />
          </div>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
