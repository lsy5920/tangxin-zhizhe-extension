import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Cloud, Coins, Crown, Edit2, Eye, EyeOff, HardDrive, Heart, Key, Plus, RefreshCw, ShieldCheck, Trash2, Upload, X, XCircle } from "lucide-react";
import type { AccountItem, AccountsPageIntent, BridgeState } from "../types";
import { accountAvailable, accountName, accountRights, accountStats, accountStatusLabel, formatRelativeTime, isCloudAccount, visibleAccounts } from "../helpers";

type AddType = "password" | "qrcode" | "token";
type Props = {
  state: BridgeState;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  intent?: AccountsPageIntent;
};

const modeOptions = [
  { val: "cloud", label: "云端自动轮换" },
  { val: "local", label: "本地选中" },
  { val: "cloud-first", label: "云端优先" }
];

function accountTypeText(type: AddType) {
  if (type === "password") return "账号密码";
  if (type === "qrcode") return "账号凭证";
  return "token/deviceId";
}

export function AccountsPage({ state, onAction, intent }: Props) {
  const [showInvalid, setShowInvalid] = useState(false);
  const [workerUrl, setWorkerUrl] = useState(state.remote?.baseUrl || "");
  const [sourceMode, setSourceMode] = useState(state.remote?.accountSourceMode || "cloud");
  const [addType, setAddType] = useState<AddType>("password");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [form, setForm] = useState({ accountNickname: "", accountUsername: "", accountPassword: "", accountDeviceId: "", accountToken: "", accountQrcode: "", accountNotes: "" });

  const stats = accountStats(state);
  const accounts = useMemo(() => visibleAccounts(state, showInvalid), [state, showInvalid]);

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

  const chooseType = (type: AddType) => { setAddType(type); setShowTypeSelect(false); setShowAddModal(true); };

  const renderAccount = (account: AccountItem) => {
    const cloud = isCloudAccount(account);
    const ok = accountAvailable(account);
    const selected = account.id && account.id === state.selectedFullAccountId;
    const rights = accountRights(account);
    const lastVerified = (account as unknown as { lastVerifiedAt?: string }).lastVerifiedAt;
    const tokenMasked = account.tokenMasked || "";

    return (
      <div key={account.id || accountName(account)} className={`rounded-2xl border bg-white p-3 shadow-sm transition-all ${selected ? "border-pink-300 ring-1 ring-pink-200" : ok ? "border-pink-100" : "border-rose-100 opacity-70"}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0 ${ok ? "bg-gradient-to-br from-pink-400 to-purple-500" : "bg-gray-300"}`}>
              {accountName(account).slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-purple-800 truncate max-w-[140px]">{accountName(account)}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {selected && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] text-pink-600 font-medium">已选中</span>}
                {cloud && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-600">云端</span>}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>{accountStatusLabel(account)}</span>
              </div>
            </div>
          </div>
          {ok ? <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />}
        </div>

        <div className="mt-2 ml-10 flex flex-wrap gap-3 text-[11px] text-purple-400">
          <span className="flex items-center gap-0.5"><Crown size={11} className={rights.vip ? "text-amber-400" : "text-gray-300"} />{rights.vip ? "VIP 已开通" : "VIP 未开通"}</span>
          <span className="flex items-center gap-0.5"><Heart size={11} className={rights.dark ? "text-pink-400" : "text-gray-300"} />{rights.dark ? "尤物圈" : "未开通"}</span>
          <span className="flex items-center gap-0.5"><Coins size={11} className="text-amber-400" />{rights.coins !== undefined && rights.coins !== null ? `${rights.coins} 金币` : "金币未知"}</span>
        </div>

        {cloud && (tokenMasked || lastVerified) && (
          <div className="mt-1.5 ml-10 flex flex-wrap gap-x-3 text-[10px] text-purple-300">
            {tokenMasked && <span className="flex items-center gap-0.5"><Key size={9} />{tokenMasked}</span>}
            {lastVerified && <span className="flex items-center gap-0.5"><ShieldCheck size={9} className="text-emerald-400" />验证于 {formatRelativeTime(lastVerified)}</span>}
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button onClick={() => onAction("verify-account", { accountId: account.id || "" })} className="flex items-center gap-0.5 rounded-full bg-sky-50 hover:bg-sky-100 px-2 py-1 text-[10px] text-sky-500 transition-colors" title="检查账号有效性">
            <ShieldCheck size={11} /> 检查
          </button>
          {!cloud && (
            <>
              <button onClick={() => onAction("select-account", { accountId: account.id || "" })} className={`rounded-full px-2 py-1 text-[10px] transition-colors ${selected ? "bg-pink-100 text-pink-600" : "bg-purple-50 hover:bg-purple-100 text-purple-500"}`}>{selected ? "已选" : "选择"}</button>
              <button onClick={() => onAction("upload-local-account-remote", { accountId: account.id || "" })} className="rounded-full p-1.5 text-sky-400 hover:bg-sky-50 transition-colors" title="上传至云端"><Upload size={12} /></button>
              <button onClick={() => onAction("edit-account", { accountId: account.id || "" })} className="rounded-full p-1.5 text-purple-400 hover:bg-purple-50 transition-colors" title="编辑账号"><Edit2 size={12} /></button>
              <button onClick={() => onAction("remove-account", { accountId: account.id || "" })} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-50 transition-colors" title="删除账号"><Trash2 size={12} /></button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "全部", value: stats.total, color: "bg-purple-100 text-purple-700" },
          { label: "云端可用", value: stats.cloudAvailable, color: "bg-emerald-100 text-emerald-700" },
          { label: "本地", value: stats.local, color: "bg-sky-100 text-sky-700" },
          { label: "失效", value: stats.invalid, color: "bg-rose-100 text-rose-700" }
        ].map((item) => (
          <div key={item.label} className={`${item.color} rounded-2xl p-2 text-center`}>
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-[10px] opacity-75">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><Cloud size={14} className="text-sky-400" /> 远程配置</h3>
        <div>
          <label className="mb-1 block text-[11px] text-purple-400">云端服务地址</label>
          <input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs text-purple-700 outline-none focus:border-purple-400" placeholder="https://txzzsecure.lsy20.top" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-purple-400">账号来源模式</label>
          <div className="flex flex-wrap gap-2">
            {modeOptions.map((mode) => (
              <button key={mode.val} onClick={() => setSourceMode(mode.val)} className={`rounded-full border px-3 py-1.5 text-[11px] transition-all ${sourceMode === mode.val ? "border-transparent bg-gradient-to-r from-pink-400 to-purple-400 text-white shadow-md" : "border-pink-200 bg-white text-purple-500"}`}>{mode.label}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveRemote} className="flex-1 rounded-xl bg-gradient-to-r from-pink-400 to-rose-400 py-2 text-xs font-medium text-white shadow-md transition-transform active:scale-95">保存配置</button>
          <button onClick={() => onAction("sync-remote")} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-purple-400 to-violet-400 py-2 text-xs font-medium text-white shadow-md transition-transform active:scale-95"><RefreshCw size={12} /> 同步云端</button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><Cloud size={14} className="text-sky-400" /> 云端账号</h3>
          <button onClick={() => setShowInvalid((v) => !v)} className="flex items-center gap-1 text-[11px] text-purple-400">
            {showInvalid ? <EyeOff size={12} /> : <Eye size={12} />}{showInvalid ? "隐藏失效" : "查看失效"}
          </button>
        </div>
        <div className="space-y-2">
          {accounts.filter(isCloudAccount).map(renderAccount)}
          {!accounts.filter(isCloudAccount).length && <div className="rounded-2xl border border-pink-100 bg-white p-3 text-xs text-purple-400 shadow-sm">暂无云端账号，请先保存云端服务地址并同步账号池。</div>}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-purple-700"><HardDrive size={14} className="text-pink-400" /> 本地账号</h3>
          <button onClick={() => setShowTypeSelect(true)} className="flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 px-3 py-1 text-[11px] text-white shadow-sm"><Plus size={12} /> 添加账号</button>
        </div>
        <div className="space-y-2">
          {accounts.filter((a) => !isCloudAccount(a)).map(renderAccount)}
          {!accounts.filter((a) => !isCloudAccount(a)).length && <div className="rounded-2xl border border-pink-100 bg-white p-3 text-xs text-purple-400 shadow-sm">暂无本地账号。</div>}
        </div>
      </div>

      {showTypeSelect && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setShowTypeSelect(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-purple-800">选择账号类型</h3>
              <button onClick={() => setShowTypeSelect(false)}><X size={18} className="text-purple-400" /></button>
            </div>
            <div className="space-y-2">
              {([
                { type: "password" as AddType, label: "账号密码", desc: "使用用户名和密码登录" },
                { type: "qrcode" as AddType, label: "账号凭证", desc: "使用账号凭证字符串" },
                { type: "token" as AddType, label: "token/deviceId", desc: "使用 token 和 deviceId" }
              ]).map((item) => (
                <button key={item.type} onClick={() => chooseType(item.type)} className="w-full rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50 p-3 text-left transition-all hover:from-pink-100 hover:to-purple-100">
                  <p className="text-sm font-semibold text-purple-800">{item.label}</p>
                  <p className="text-xs text-purple-400">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-purple-800">{accountTypeText(addType)}</h3>
              <button onClick={() => setShowAddModal(false)}><X size={18} className="text-purple-400" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="账号昵称" value={form.accountNickname} onChange={(e) => setForm({ ...form, accountNickname: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
              {addType === "password" && (<>
                <input placeholder="用户名" value={form.accountUsername} onChange={(e) => setForm({ ...form, accountUsername: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
                <input type="password" placeholder="密码" value={form.accountPassword} onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </>)}
              {addType === "qrcode" && <textarea placeholder="账号凭证内容" rows={3} value={form.accountQrcode} onChange={(e) => setForm({ ...form, accountQrcode: e.target.value })} className="w-full resize-none rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />}
              {addType === "token" && (<>
                <input placeholder="deviceId" value={form.accountDeviceId} onChange={(e) => setForm({ ...form, accountDeviceId: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
                <input placeholder="userToken" value={form.accountToken} onChange={(e) => setForm({ ...form, accountToken: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </>)}
              <input placeholder="备注" value={form.accountNotes} onChange={(e) => setForm({ ...form, accountNotes: e.target.value })} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm outline-none focus:border-purple-400" />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => submitAccount(false)} className="flex-1 rounded-xl border border-pink-200 py-2 text-sm font-medium text-purple-500">保存本地</button>
              <button type="button" onClick={() => submitAccount(true)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 py-2 text-sm font-medium text-white shadow-md"><Upload size={14} /> 保存并上传云端</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
