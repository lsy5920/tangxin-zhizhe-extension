import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Cloud, Coins, Crown, Edit2, Eye, EyeOff, HardDrive, Heart, Key, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, XCircle } from "lucide-react";
import type { AccountItem, AccountsPageIntent, BridgeState } from "../types";
import { accountAvailable, accountName, accountRights, accountStats, accountStatusLabel, formatRelativeTime, isCloudAccount, visibleAccounts } from "../helpers";
import {
  ACCOUNT_SOURCE_MODES,
  accountCredentialLabel,
  EMPTY_ACCOUNT_FORM,
  normalizeWorkerAddress,
  validateAccountForm
} from "../domain/accounts";
import type { AccountCredentialType } from "../domain/accounts";
import {
  EmptyState,
  FieldLabel,
  ModalSheet,
  PageIntro,
  PageShell,
  Pill,
  SectionCard,
  SoftButton,
  SoftInput,
  SoftTextarea,
  StatGrid
} from "./ui/primitives";

type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  intent?: AccountsPageIntent;
  onIntentHandled?: () => void;
};

export function AccountsPage({ state, onAction, intent, onIntentHandled }: Props) {
  const [showInvalid, setShowInvalid] = useState(false);
  const [workerUrl, setWorkerUrl] = useState(state.remote?.baseUrl || "");
  const [sourceMode, setSourceMode] = useState(state.remote?.accountSourceMode || "cloud");
  const [configError, setConfigError] = useState("");
  const [query, setQuery] = useState("");
  const [addType, setAddType] = useState<AccountCredentialType>("password");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AccountItem | null>(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);

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
    const hasIntent = typeof intent?.showInvalid === "boolean" || Boolean(intent?.openAdd);
    if (typeof intent?.showInvalid === "boolean") setShowInvalid(intent.showInvalid);
    if (intent?.openAdd) setShowTypeSelect(true);
    // 设置页的快捷意图只消费一次，避免离开后再次进入账号页仍自动弹窗。
    if (hasIntent) onIntentHandled?.();
  }, [intent?.showInvalid, intent?.openAdd, onIntentHandled]);

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
    const validationError = validateAccountForm(addType, form, existing);
    if (validationError) { setFormError(validationError); return; }
    setFormError("");
    onAction(upload ? "upload-account-remote" : "save-account", {
      ...form,
      accountId: editingAccountId,
      accountCredentialMode: addType
    });
    setShowAddModal(false);
    setEditingAccountId("");
    setForm(EMPTY_ACCOUNT_FORM);
  };

  const chooseType = (type: AccountCredentialType) => {
    setAddType(type);
    setEditingAccountId("");
    setForm(EMPTY_ACCOUNT_FORM);
    setFormError("");
    setShowTypeSelect(false);
    setShowAddModal(true);
  };

  const editAccount = (account: AccountItem) => {
    const credentialType: AccountCredentialType = account.hasQrcode ? "qrcode" : account.hasToken ? "token" : "password";
    setAddType(credentialType);
    setEditingAccountId(account.id || "");
    setForm({
      ...EMPTY_ACCOUNT_FORM,
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
    setForm(EMPTY_ACCOUNT_FORM);
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
        className={`rounded-[1.4rem] border bg-white/90 p-3.5 shadow-[var(--txzz-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-md ${
          selected ? "border-brand-300 ring-2 ring-brand-100" : ok ? "border-slate-200" : "border-danger-100 bg-danger-50/30"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className={`flex h-10 w-10 shrink-0 rotate-[-3deg] items-center justify-center rounded-[0.95rem] border-2 border-white text-sm font-extrabold text-white shadow-sm ${ok ? "bg-gradient-to-br from-brand-400 to-brand-600" : "bg-slate-400"}`}>
              {accountName(account).slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-slate-900">{accountName(account)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected && <Pill className="bg-brand-100 text-brand-700">当前选中</Pill>}
                {cloud && <Pill className="bg-info-50 text-info-600">云端只读</Pill>}
                <Pill className={ok ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600"}>{accountStatusLabel(account)}</Pill>
              </div>
            </div>
          </div>
          {ok ? <CheckCircle size={17} className="mt-1 shrink-0 text-success-500" /> : <XCircle size={17} className="mt-1 shrink-0 text-danger-500" />}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-center">
            <Crown size={13} className={`mx-auto ${rights.vip ? "text-warning-500" : "text-slate-300"}`} />
            <p className="mt-1 text-[11px] font-medium text-slate-600">{rights.vip ? "VIP 可用" : "无 VIP"}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-center">
            <Heart size={13} className={`mx-auto ${rights.dark ? "text-danger-500" : "text-slate-300"}`} />
            <p className="mt-1 text-[11px] font-medium text-slate-600">{rights.dark ? "尤物圈" : "未开通"}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2 text-center">
            <Coins size={13} className="mx-auto text-warning-500" />
            <p className="mt-1 truncate text-[11px] font-medium text-slate-600">
              {rights.coins !== undefined && rights.coins !== null ? rights.coins : "?"} 币
            </p>
          </div>
        </div>

        {cloud && (tokenMasked || lastVerified) && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            {tokenMasked && <span className="flex items-center gap-1"><Key size={11} />{tokenMasked}</span>}
            {lastVerified && <span className="flex items-center gap-1"><ShieldCheck size={11} className="text-success-500" />{formatRelativeTime(lastVerified)}验证</span>}
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
      <PageIntro
        eyebrow="ACCOUNT HOME"
        title="账号小屋"
        description="让云端账号自动轮班，也可以保留只在本机使用的伙伴；敏感凭据仍只交给扩展后台处理。"
        actions={<SoftButton size="sm" icon={Plus} onClick={() => setShowTypeSelect(true)}>邀请账号入住</SoftButton>}
        meta={
          <>
            <Pill className={state.remote?.lastError ? "bg-danger-50 text-danger-600" : state.remote?.lastSyncAt ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}>
              {state.remote?.lastError ? "云端连接异常" : state.remote?.lastSyncAt ? `云端已于${formatRelativeTime(state.remote.lastSyncAt)}同步` : "云端尚未同步"}
            </Pill>
            <Pill className="bg-[#f2efff] text-[#715fc1]">{sourceMode === "local" ? "本地值班" : sourceMode === "cloud-first" ? "云端优先" : "云端轮班"}</Pill>
          </>
        }
      />

      <StatGrid
        items={[
          { label: "全部", value: stats.total, tone: "purple" },
          { label: "云端可用", value: stats.cloudAvailable, tone: "emerald" },
          { label: "本地", value: stats.local, tone: "sky" },
          { label: "失效", value: stats.invalid, tone: "rose" }
        ]}
      />

      <SectionCard title="小屋连接与轮班方式" icon={Cloud} hint="服务标识已安全内置，只需填写地址；保存后会立即敲门验证" tone="sky">
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
              {ACCOUNT_SOURCE_MODES.map((mode) => {
                const active = sourceMode === mode.val;
                return (
                  <button
                    key={mode.val}
                    type="button"
                    onClick={() => setSourceMode(mode.val)}
                    aria-pressed={active}
                    className={`rounded-[1.1rem] border px-3 py-3 text-left transition hover:-translate-y-0.5 ${
                      active
                        ? "border-brand-500 bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_7px_17px_rgba(221,72,108,0.18)]"
                        : "border-slate-200 bg-white/85 text-slate-700 hover:border-brand-200 hover:bg-brand-50"
                    }`}
                  >
                    <p className="text-[12px] font-semibold">{mode.label}</p>
                    <p className={`mt-0.5 text-[11px] ${active ? "text-white/75" : "text-slate-500"}`}>{mode.desc}</p>
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
            <p className="flex items-start gap-1.5 rounded-xl bg-danger-50 px-3 py-2.5 text-[12px] leading-relaxed text-danger-600" role="alert">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />{configError}
            </p>
          )}
          {state.remote?.lastSyncAt && (
            <p className="flex items-center gap-1.5 text-[11px] text-success-600"><CheckCircle size={12} />上次同步：{formatRelativeTime(state.remote.lastSyncAt)}</p>
          )}
          {state.remote?.lastError && (
            <p className="rounded-xl bg-danger-50 px-3 py-2 text-[11px] text-danger-600">{state.remote.lastError}</p>
          )}
        </div>
      </SectionCard>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-slate-400" />
        <SoftInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9 pr-16"
          placeholder="搜索账号名称、用户名或备注"
          aria-label="搜索账号"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{accounts.length} 个</span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard
        title="云端房间"
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
        title="本地房间"
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
      </div>

      <ModalSheet open={showTypeSelect} onClose={() => setShowTypeSelect(false)} title="邀请哪一种账号入住？">
        <div className="space-y-2">
          {([
            { type: "password" as AccountCredentialType, label: "账号密码", desc: "使用用户名和密码登录" },
            { type: "qrcode" as AccountCredentialType, label: "账号凭证", desc: "使用账号凭证字符串" },
            { type: "token" as AccountCredentialType, label: "token / deviceId", desc: "使用 token 和 deviceId" }
          ]).map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => chooseType(item.type)}
              className="w-full rounded-[1.3rem] border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:from-white hover:to-brand-50 active:translate-y-0 active:scale-[0.99]"
            >
              <p className="text-[14px] font-semibold text-slate-900">{item.label}</p>
              <p className="mt-1 text-[12px] text-slate-500">{item.desc}</p>
            </button>
          ))}
        </div>
      </ModalSheet>

      <ModalSheet
        open={showAddModal}
        onClose={closeAccountModal}
        title={editingAccountId ? `编辑${accountCredentialLabel(addType)}` : accountCredentialLabel(addType)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <SoftButton variant="secondary" className="w-full" onClick={() => submitAccount(false)}>{editingAccountId ? "保存修改" : "保存本地"}</SoftButton>
            <SoftButton className="w-full" icon={Upload} onClick={() => submitAccount(true)}>{editingAccountId ? "修改并上传" : "保存并上传"}</SoftButton>
          </div>
        }
      >
        <div className="space-y-2.5">
          {editingAccountId && (
            <p className="rounded-xl bg-info-50 px-3 py-2.5 text-[12px] leading-relaxed text-info-600">
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
          {formError && <p className="rounded-xl bg-danger-50 px-3 py-2.5 text-[12px] text-danger-600" role="alert">{formError}</p>}
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-50 text-danger-500"><AlertTriangle size={18} /></div>
          <p className="text-[13px] leading-relaxed text-slate-600">
            将删除“{pendingDelete ? accountName(pendingDelete) : "该账号"}”及其本地凭据。云端已上传的账号不会一并删除。
          </p>
        </div>
      </ModalSheet>
    </PageShell>
  );
}
