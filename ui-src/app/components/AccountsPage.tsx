import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Cloud, Coins, Crown, Edit2, Eye, EyeOff, HardDrive, Heart, Key, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, XCircle } from "lucide-react";
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

/** 校验并规范云端服务地址，线上仅允许 HTTPS，本机调试允许 HTTP。 */
function normalizeWorkerAddress(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(String(value || "").trim());
  } catch (_) {
    throw new Error("请输入包含 https:// 的完整云端服务地址");
  }
  const localHost = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    throw new Error("云端服务地址必须使用 HTTPS；只有本机调试地址可使用 HTTP");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("云端服务地址不能包含账号、密码、查询参数或锚点");
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path === "/" ? "" : path}`;
}

const emptyAccountForm = {
  accountNickname: "",
  accountUsername: "",
  accountPassword: "",
  accountDeviceId: "",
  accountToken: "",
  accountQrcode: "",
  accountNotes: ""
};

export function AccountsPage({ state, onAction, intent }: Props) {
  const [showInvalid, setShowInvalid] = useState(false);
  const [workerUrl, setWorkerUrl] = useState(state.remote?.baseUrl || "");
  const [sourceMode, setSourceMode] = useState(state.remote?.accountSourceMode || "cloud");
  const [configError, setConfigError] = useState("");
  const [query, setQuery] = useState("");
  const [addType, setAddType] = useState<AddType>("password");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AccountItem | null>(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptyAccountForm);

  const stats = accountStats(state);
  const accounts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    const source = visibleAccounts(state, showInvalid);
    if (!normalizedQuery) return source;
    return source.filter((account) => [accountName(account), account.username, account.id, account.notes]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(normalizedQuery)));
  }, [state, showInvalid, query]);
  const cloudAccounts = accounts.filter(isCloudAccount);
  const localAccounts = accounts.filter((a) => !isCloudAccount(a));

  useEffect(() => {
    setWorkerUrl(state.remote?.baseUrl || "");
    setSourceMode(state.remote?.accountSourceMode || "cloud");
    setConfigError("");
  }, [state.remote?.baseUrl, state.remote?.accountSourceMode]);

  useEffect(() => {
    if (typeof intent?.showInvalid === "boolean") setShowInvalid(intent.showInvalid);
    if (intent?.openAdd) setShowTypeSelect(true);
  }, [intent?.showInvalid, intent?.openAdd]);

  const saveRemote = () => {
    try {
      const normalizedUrl = normalizeWorkerAddress(workerUrl);
      setWorkerUrl(normalizedUrl);
      setConfigError("");
      onAction("save-remote", {
        remoteBaseUrl: normalizedUrl,
        accountSourceMode: sourceMode
      });
    } catch (err: unknown) {
      setConfigError(err instanceof Error ? err.message : "云端服务地址无效");
    }
  };

  const submitAccount = (upload: boolean) => {
    const existing = state.accountPool?.find((account) => account.id === editingAccountId);
    const canKeepExisting = addType === "password"
      ? Boolean(existing?.hasPassword)
      : addType === "qrcode"
        ? Boolean(existing?.hasQrcode)
        : Boolean(existing?.hasToken);
    if (addType === "password" && !form.accountUsername.trim()) {
      setFormError("请填写登录用户名");
      return;
    }
    const hasNewCredential = addType === "password"
      ? Boolean(form.accountPassword)
      : addType === "qrcode"
        ? Boolean(form.accountQrcode.trim())
        : Boolean(form.accountDeviceId.trim() && form.accountToken.trim());
    const hasPartialTokenCredential = addType === "token" && Boolean(form.accountDeviceId.trim() || form.accountToken.trim());
    if (hasPartialTokenCredential && !canKeepExisting && !hasNewCredential) {
      setFormError("首次保存 token 账号时，deviceId 和 userToken 必须同时填写");
      return;
    }
    if (!hasNewCredential && !canKeepExisting) {
      setFormError(addType === "password" ? "请填写登录密码" : addType === "qrcode" ? "请填写账号凭证" : "请同时填写 deviceId 和 userToken");
      return;
    }
    setFormError("");
    onAction(upload ? "upload-account-remote" : "save-account", {
      ...form,
      accountId: editingAccountId,
      accountCredentialMode: addType
    });
    setShowAddModal(false);
    setEditingAccountId("");
    setForm(emptyAccountForm);
  };

  const chooseType = (type: AddType) => {
    setAddType(type);
    setEditingAccountId("");
    setForm(emptyAccountForm);
    setFormError("");
    setShowTypeSelect(false);
    setShowAddModal(true);
  };

  const editAccount = (account: AccountItem) => {
    const credentialType: AddType = account.hasQrcode ? "qrcode" : account.hasToken ? "token" : "password";
    setAddType(credentialType);
    setEditingAccountId(account.id || "");
    setForm({
      ...emptyAccountForm,
      accountNickname: account.label || accountName(account),
      accountUsername: account.username || "",
      accountNotes: account.notes || ""
    });
    setFormError("");
    setShowAddModal(true);
  };

  const closeAccountModal = () => {
    setShowAddModal(false);
    setEditingAccountId("");
    setFormError("");
    setForm(emptyAccountForm);
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
              <SoftButton size="xs" variant="ghost" icon={Edit2} title="编辑账号" onClick={() => editAccount(account)} />
              <SoftButton size="xs" variant="danger" icon={Trash2} title="删除账号" onClick={() => setPendingDelete(account)} />
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

      <SectionCard title="云端连接" icon={Cloud} hint="填写服务地址后即可直接体检、同步和使用" tone="sky">
        <div className="space-y-3">
          <div>
            <FieldLabel htmlFor="txzz-worker-url">云端服务地址</FieldLabel>
            <SoftInput
              id="txzz-worker-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={workerUrl}
              onChange={(e) => { setWorkerUrl(e.target.value); setConfigError(""); }}
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
                    aria-pressed={active}
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
            <SoftButton className="w-full" icon={ShieldCheck} onClick={saveRemote}>保存并验证</SoftButton>
            <SoftButton className="w-full" variant="sky" icon={RefreshCw} onClick={() => onAction("sync-remote")}>同步云端</SoftButton>
          </div>
          {configError && (
            <p className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-2.5 py-2 text-[10px] leading-relaxed text-rose-600" role="alert">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />{configError}
            </p>
          )}
          {state.remote?.lastSyncAt && (
            <p className="flex items-center gap-1 text-[10px] text-emerald-500"><CheckCircle size={11} />上次同步：{formatRelativeTime(state.remote.lastSyncAt)}</p>
          )}
          {state.remote?.lastError && (
            <p className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-[10px] text-rose-500">{state.remote.lastError}</p>
          )}
        </div>
      </SectionCard>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-purple-300" />
        <SoftInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9 pr-16"
          placeholder="搜索账号名称、用户名或备注"
          aria-label="搜索账号"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-purple-300">{accounts.length} 个</span>
      </div>

      <SectionCard
        title="云端账号"
        icon={Cloud}
        hint={query ? `找到 ${cloudAccounts.length} 个云端账号` : "只读轮换账号，不可手动删除"}
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
        hint={query ? `找到 ${localAccounts.length} 个本地账号` : "可手动添加、选择、上传与删除"}
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
        onClose={closeAccountModal}
        title={editingAccountId ? `编辑${accountTypeText(addType)}` : accountTypeText(addType)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => submitAccount(false)}>{editingAccountId ? "保存修改" : "保存本地"}</SoftButton>
            <SoftButton className="w-full" icon={Upload} onClick={() => submitAccount(true)}>{editingAccountId ? "修改并上传" : "保存并上传"}</SoftButton>
          </div>
        }
      >
        <div className="space-y-2.5">
          {editingAccountId && (
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-600">
              凭据输入框留空会保留原凭据；只有填写新内容时才会替换。
            </p>
          )}
          <div>
            <FieldLabel htmlFor="txzz-account-nickname">账号昵称</FieldLabel>
            <SoftInput id="txzz-account-nickname" autoComplete="nickname" placeholder="显示名称" value={form.accountNickname} onChange={(e) => setForm({ ...form, accountNickname: e.target.value })} />
          </div>
          {addType === "password" && (
            <>
              <div>
                <FieldLabel htmlFor="txzz-account-username">用户名</FieldLabel>
                <SoftInput id="txzz-account-username" autoComplete="username" placeholder="登录用户名" value={form.accountUsername} onChange={(e) => setForm({ ...form, accountUsername: e.target.value })} />
              </div>
              <div>
                <FieldLabel htmlFor="txzz-account-password">密码</FieldLabel>
                <SoftInput id="txzz-account-password" type="password" autoComplete="current-password" placeholder={editingAccountId ? "留空保留原密码" : "登录密码"} value={form.accountPassword} onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} />
              </div>
            </>
          )}
          {addType === "qrcode" && (
            <div>
              <FieldLabel htmlFor="txzz-account-qrcode">账号凭证</FieldLabel>
              <SoftTextarea id="txzz-account-qrcode" rows={3} placeholder={editingAccountId ? "留空保留原账号凭证" : "粘贴凭证内容"} value={form.accountQrcode} onChange={(e) => setForm({ ...form, accountQrcode: e.target.value })} />
            </div>
          )}
          {addType === "token" && (
            <>
              <div>
                <FieldLabel htmlFor="txzz-account-device">deviceId</FieldLabel>
                <SoftInput id="txzz-account-device" autoComplete="off" placeholder={editingAccountId ? "留空保留原设备 ID" : "设备 ID"} value={form.accountDeviceId} onChange={(e) => setForm({ ...form, accountDeviceId: e.target.value })} />
              </div>
              <div>
                <FieldLabel htmlFor="txzz-account-token">userToken</FieldLabel>
                <SoftInput id="txzz-account-token" type="password" autoComplete="off" placeholder={editingAccountId ? "留空保留原用户 token" : "用户 token"} value={form.accountToken} onChange={(e) => setForm({ ...form, accountToken: e.target.value })} />
              </div>
            </>
          )}
          <div>
            <FieldLabel htmlFor="txzz-account-notes">备注（可选）</FieldLabel>
            <SoftInput id="txzz-account-notes" placeholder="备注说明" value={form.accountNotes} onChange={(e) => setForm({ ...form, accountNotes: e.target.value })} />
          </div>
          {formError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] text-rose-600" role="alert">{formError}</p>}
        </div>
      </ModalSheet>

      <ModalSheet
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="确认删除本地账号？"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => setPendingDelete(null)}>取消</SoftButton>
            <SoftButton
              variant="danger"
              className="w-full"
              icon={Trash2}
              onClick={() => {
                onAction("remove-account", { accountId: pendingDelete?.id || "" });
                setPendingDelete(null);
              }}
            >
              确认删除
            </SoftButton>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-500"><AlertTriangle size={18} /></div>
          <p className="text-xs leading-relaxed text-purple-500">
            将删除“{pendingDelete ? accountName(pendingDelete) : "该账号"}”及其本地凭据。云端已上传的账号不会一并删除。
          </p>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
