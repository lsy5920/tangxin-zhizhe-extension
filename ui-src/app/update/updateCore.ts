import "../../../update_core.js";

type UpdateLike = { version?: string; build?: string };

type UpdateDecisionCore = {
  canReuseSuccessCache: (options: {
    cachedResult?: { ok?: boolean; local?: { version?: string; build?: string } } | null;
    lastCheckedAt?: number;
    now?: number;
    ttlMs?: number;
    localVersion?: string;
    localBuild?: string;
    force?: boolean;
    realtime?: boolean;
  }) => boolean;
  compareBuilds: (left?: string, right?: string) => number;
  compareVersions: (left?: string, right?: string) => number;
  localIdentityMatches: (cachedResult?: object, localVersion?: string, localBuild?: string) => boolean;
  parseBuildStamp: (value?: string) => number | null;
  shouldUpdate: (remote?: UpdateLike, localVersion?: string, localBuild?: string) => boolean;
};

const installedUpdateCore = (globalThis as typeof globalThis & { TxzzUpdateCore?: UpdateDecisionCore }).TxzzUpdateCore;

if (!installedUpdateCore) throw new Error("更新决策核心未加载");

export const updateCore: UpdateDecisionCore = installedUpdateCore;
