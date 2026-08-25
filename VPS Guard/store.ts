/**
 * 持久化层。
 *
 * 所有键都存在当前脚本的私有 Storage 域里 —— index.tsx / widget.tsx /
 * app_intents.tsx 属于同一个脚本项目，共享同一个域，所以不需要 shared: true。
 * Storage 是同步 API，小组件里读它不会有 IO 等待，这正是我们要的。
 */

import {
  DEFAULT_PROBE,
  DEFAULT_SETTINGS,
  emptyState,
  type Host,
  type HostState,
  type Sample,
  type Settings,
  type Snapshot,
} from "./types"

const K_HOSTS = "vpsguard.hosts.v1"
const K_SNAPSHOT = "vpsguard.snapshot.v1"
const K_SETTINGS = "vpsguard.settings.v1"
const K_ICMP = "vpsguard.icmpAvailable.v1"

// ---------------------------------------------------------------- 主机列表

export function loadHosts(): Host[] {
  const raw = Storage.get<Host[]>(K_HOSTS)
  if (!Array.isArray(raw)) return []
  // 容错：老版本数据缺字段时补齐，避免 UI 里到处判空
  return raw
    .filter(h => h != null && typeof h.id === "string")
    .map((h, i) => ({
      ...h,
      alias: h.alias || h.address || "未命名",
      ip: h.ip || h.address,
      probe: { ...DEFAULT_PROBE, ...(h.probe ?? {}) },
      order: typeof h.order === "number" ? h.order : i,
      createdAt: h.createdAt ?? Date.now(),
    }))
    .sort((a, b) => a.order - b.order)
}

export function saveHosts(hosts: Host[]): boolean {
  // 存的时候把 order 重排成数组下标，避免删除后留下空洞
  const normalized = hosts.map((h, i) => ({ ...h, order: i }))
  return Storage.set(K_HOSTS, normalized)
}

// ---------------------------------------------------------------- 设置

export function loadSettings(): Settings {
  const raw = Storage.get<Partial<Settings>>(K_SETTINGS)
  // 用展开合并，这样将来加新设置项时老用户不会读到 undefined
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
}

export function saveSettings(s: Settings): boolean {
  return Storage.set(K_SETTINGS, s)
}

// ---------------------------------------------------------------- 快照

export function loadSnapshot(): Snapshot {
  const raw = Storage.get<Snapshot>(K_SNAPSHOT)
  if (raw == null || typeof raw !== "object") {
    return { updatedAt: 0, networkOk: true, states: {} }
  }
  return {
    updatedAt: raw.updatedAt ?? 0,
    networkOk: raw.networkOk ?? true,
    states: raw.states ?? {},
  }
}

export function saveSnapshot(s: Snapshot): boolean {
  return Storage.set(K_SNAPSHOT, s)
}

export function stateOf(snap: Snapshot, hostId: string): HostState {
  return snap.states[hostId] ?? emptyState()
}

/** 清掉已删除主机留下的孤儿状态，别让 Storage 无限长胖 */
export function pruneSnapshot(snap: Snapshot, hosts: Host[]): Snapshot {
  const alive = new Set(hosts.map(h => h.id))
  const states: Record<string, HostState> = {}
  for (const id of Object.keys(snap.states)) {
    if (alive.has(id)) states[id] = snap.states[id]
  }
  return { ...snap, states }
}

/** 往环形历史里追加一个采样点，超出上限就丢最老的 */
export function pushSample(
  state: HostState,
  sample: Sample,
  maxPoints: number,
): HostState {
  const history = [...state.history, sample]
  if (history.length > maxPoints) {
    history.splice(0, history.length - maxPoints)
  }
  return { ...state, history }
}

// 可用率 / 平均延迟等派生计算统一放 format.ts，这里只管存取。

// ------------------------------------------------- ICMP 可用性（真机自检结果）

/**
 * ios_system 是否内置 ping —— 文档没有明确列出，只能在真机上试一次再记下来。
 * null 表示还没测过。
 */
export function loadIcmpAvailable(): boolean | null {
  const v = Storage.get<boolean>(K_ICMP)
  return typeof v === "boolean" ? v : null
}

export function saveIcmpAvailable(v: boolean): boolean {
  return Storage.set(K_ICMP, v)
}

// ---------------------------------------------------------------- 排序

export function sortHosts(
  hosts: Host[],
  snap: Snapshot,
  mode: Settings["sortMode"],
): Host[] {
  const arr = [...hosts]
  switch (mode) {
    case "alias":
      return arr.sort((a, b) => a.alias.localeCompare(b.alias, "zh-Hans-CN"))
    case "rtt":
      return arr.sort((a, b) => {
        const ra = stateOf(snap, a.id).rtt
        const rb = stateOf(snap, b.id).rtt
        // 没有延迟数据的排最后
        if (ra < 0 && rb < 0) return a.order - b.order
        if (ra < 0) return 1
        if (rb < 0) return -1
        return ra - rb
      })
    case "status": {
      // 出问题的排前面 —— 一眼就能看到该管的那台
      const rank: Record<string, number> = {
        offline: 0,
        degraded: 1,
        unknown: 2,
        online: 3,
      }
      return arr.sort((a, b) => {
        const d =
          rank[stateOf(snap, a.id).status] - rank[stateOf(snap, b.id).status]
        return d !== 0 ? d : a.order - b.order
      })
    }
    default:
      return arr.sort((a, b) => a.order - b.order)
  }
}
