import type { AccountItem } from "../types";

export type AccountCredentialType = "password" | "qrcode" | "token";

export type AccountForm = {
  accountNickname: string;
  accountUsername: string;
  accountPassword: string;
  accountDeviceId: string;
  accountToken: string;
  accountQrcode: string;
  accountNotes: string;
};

export const ACCOUNT_SOURCE_MODES = [
  { val: "cloud", label: "云端轮班", desc: "按金币从少到多自动选择" },
  { val: "local", label: "本地值班", desc: "只使用当前选中的本地账号" },
  { val: "cloud-first", label: "云端优先", desc: "云端失败后再请本地账号帮忙" }
] as const;

export const EMPTY_ACCOUNT_FORM: AccountForm = {
  accountNickname: "",
  accountUsername: "",
  accountPassword: "",
  accountDeviceId: "",
  accountToken: "",
  accountQrcode: "",
  accountNotes: ""
};

export function accountCredentialLabel(type: AccountCredentialType) {
  if (type === "password") return "账号密码";
  if (type === "qrcode") return "账号凭证";
  return "token / deviceId";
}

/** 线上只允许 HTTPS，本机调试保留 HTTP；同时剔除容易误配或泄露的 URL 部分。 */
export function normalizeWorkerAddress(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
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

function existingCredentialCanBeKept(type: AccountCredentialType, account?: AccountItem) {
  if (type === "password") return Boolean(account?.hasPassword);
  if (type === "qrcode") return Boolean(account?.hasQrcode);
  return Boolean(account?.hasToken);
}

/**
 * 凭据校验独立于弹窗状态，确保本地保存和上传云端走同一套边界规则。
 * 编辑时允许留空保留已有凭据，但首次创建必须提交完整凭据组合。
 */
export function validateAccountForm(
  type: AccountCredentialType,
  form: AccountForm,
  existing?: AccountItem
) {
  const canKeepExisting = existingCredentialCanBeKept(type, existing);
  if (type === "password" && !form.accountUsername.trim()) return "请填写登录用户名";

  const hasNewCredential = type === "password"
    ? Boolean(form.accountPassword)
    : type === "qrcode"
      ? Boolean(form.accountQrcode.trim())
      : Boolean(form.accountDeviceId.trim() && form.accountToken.trim());
  const hasPartialTokenCredential = type === "token" && Boolean(form.accountDeviceId.trim() || form.accountToken.trim());

  if (hasPartialTokenCredential && !canKeepExisting && !hasNewCredential) {
    return "首次保存 token 账号时，deviceId 和 userToken 必须同时填写";
  }
  if (!hasNewCredential && !canKeepExisting) {
    if (type === "password") return "请填写登录密码";
    if (type === "qrcode") return "请填写账号凭证";
    return "请同时填写 deviceId 和 userToken";
  }
  return "";
}
