import {
  Download,
  House,
  Play,
  Settings,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Page } from "../types";

export type NavigationItem = {
  id: Page;
  label: string;
  shortLabel: string;
  eyebrow: string;
  subtitle: string;
  companionHint: string;
  icon: LucideIcon;
};

/**
 * 页面元信息是整个工作台的单一事实来源。
 * 导航、标题栏和移动端底栏共用它，避免文案或顺序在不同壳层中逐渐失配。
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "overview",
    label: "今日总览",
    shortLabel: "总览",
    eyebrow: "TODAY",
    subtitle: "服务状态与常用任务",
    companionHint: "先看看今天一切是否顺利吧",
    icon: House
  },
  {
    id: "accounts",
    label: "账号小屋",
    shortLabel: "账号",
    eyebrow: "ACCOUNTS",
    subtitle: "云端轮换与本地凭据",
    companionHint: "把可用账号照顾得好好的",
    icon: Users
  },
  {
    id: "playback",
    label: "放映室",
    shortLabel: "播放",
    eyebrow: "PLAYER",
    subtitle: "播放器、线路与记录",
    companionHint: "选择最顺畅的线路开始放映",
    icon: Play
  },
  {
    id: "downloads",
    label: "收纳篮",
    shortLabel: "下载",
    eyebrow: "DOWNLOADS",
    subtitle: "下载进度、保存与排查",
    companionHint: "下载好的内容会整齐放在这里",
    icon: Download
  },
  {
    id: "settings",
    label: "照料中心",
    shortLabel: "设置",
    eyebrow: "SETTINGS",
    subtitle: "体检、体验、升级与数据",
    companionHint: "偶尔体检一下，使用更安心",
    icon: Settings
  }
];

export const PAGE_META = Object.fromEntries(
  NAVIGATION_ITEMS.map((item) => [item.id, item])
) as Record<Page, NavigationItem>;

export function isPage(value: unknown): value is Page {
  return NAVIGATION_ITEMS.some((item) => item.id === value);
}
