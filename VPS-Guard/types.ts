/**
 * VPS 红绿灯 — 数据模型与默认配置（本文件是唯一的模型真相来源）
 *
 * 设计约束（来自 Scripting 官方文档，务必牢记）：
 * 1. widget.tsx 是「一次性渲染」，hooks 全部无效，Widget.present() 之后的代码不执行。
 * 2. 小组件内存上限约 30MB，不要在小组件里做重活（geo 查询、DNS 解析一律不做）。
 * 3. 刷新时机由 WidgetKit 决定，reloadPolicy 只是「请求」，实际是分钟级。
 * 4. 同一个脚本项目内 index.tsx / widget.tsx / app_intents.tsx 共享同一个 Storage 域，
 *    所以不需要 shared: true。
 * 5. 不使用任何 PRO 功能（Widget.openApp / Spotlight / 重定向规则 / Health 等一律不碰）。
 * 6. 小组件是纯展示层：只同步读 Storage 快照渲染，绝不做网络请求
 *    （官方模板同构；探测全部在 App 内完成）。
 */

/** 探测方式 */
export type ProbeType =
  /** TCP 连通性（默认）：能握手 / 被 RST 都算主机活着，只有超时才算离线 */
  | "tcp"
  /** HTTP(S) 探测：要求拿到响应 */
  | "http"
  /** ICMP ping（实验性）：依赖 ios_system 是否内置 ping，需在 App 内自检 */
  | "icmp"

/** 单台服务器的探测配置 */
export type ProbeConfig = {
  type: ProbeType
  /** tcp / http 用的端口。tcp 默认 22，http 默认 80 */
  port: number
  /** http 探测的路径，默认 "/" */
  path?: string
  /** http 探测是否走 https */
  https?: boolean
  /** http 探测期望的状态码。留空表示「只要有响应就算在线」 */
  expectStatus?: number
}

/** 在线状态 */
export type Status = "online" | "offline" | "degraded" | "unknown"

/** 单次探测的判定结果 */
export type ProbeOutcome =
  /** 对方有回应，机器活着 */
  | "online"
  /** 有回应但不合期望（HTTP 状态码不对），机器活着但服务不对劲 */
  | "degraded"
  /** 完全没人应答（耗到超时），判定离线 */
  | "offline"
  /** 我们这边的问题（地址解析失败等），不该算在主机头上 */
  | "error"

/** 一次探测的完整记录 */
export type ProbeResult = {
  hostId: string
  outcome: ProbeOutcome
  /** 延迟毫秒，失败为 -1 */
  rtt: number
  /** 人类可读说明，必填 —— UI 上永远有话可说，不用到处判空 */
  detail: string
  httpStatus?: number
  /** 实际尝试了几次（含首探） */
  attempts: number
  /** 域名解析出的 IP，与原始输入不同时才有值 */
  resolvedIp?: string
  startedAt: number
  finishedAt: number
}

/** 地理位置信息（添加时解析一次，之后缓存，可手动刷新） */
export type GeoInfo = {
  countryCode: string
  country: string
  region: string
  city: string
  isp: string
  asn: string
  /** 国旗 emoji，本地由 countryCode 推导，不下载图片 */
  flag: string
  /** 解析时间戳（毫秒） */
  at: number
}

/** 一台服务器 */
export type Host = {
  id: string
  /** 别名，显示用，可随时改 */
  alias: string
  /** 用户原始输入：IPv4 / IPv6 / 域名 */
  address: string
  /** 解析后的 IP。address 本身是 IP 时两者相同 */
  ip: string
  probe: ProbeConfig
  geo?: GeoInfo
  /** 排序权重，小的在前 */
  order: number
  /** 暂停探测（不删除，只是先不管它） */
  paused?: boolean
  createdAt: number
}

/** 历史采样点：t = 时间戳(毫秒)，r = 延迟毫秒，失败为 -1 */
export type Sample = { t: number; r: number }

/** 单台服务器的运行时状态 */
export type HostState = {
  status: Status
  /** 最近一次成功的延迟（毫秒），无数据为 -1 */
  rtt: number
  /** 最近一次探测时间（毫秒） */
  lastProbeAt: number
  /** 最近一次「在线」的时间（毫秒），用来显示「已离线 3 小时」 */
  lastOnlineAt: number
  /** 连续失败轮数（一轮 = 首探 + 重试都失败） */
  consecFail: number
  /** 退避：早于这个时间点就不再探测（毫秒）。0 表示随时可探 */
  nextProbeAt: number
  /** 最近一次探测的人类可读说明 */
  detail: string
  /** 最近一轮尝试次数 */
  attempts: number
  /** 环形历史，末尾是最新 */
  history: Sample[]
}

/** 全局快照：小组件直接读这个，不做任何解析工作 */
export type Snapshot = {
  /** 上次完成探测轮次的时间（毫秒） */
  updatedAt: number
  /** 本机网络是否可用。false 时不要相信各主机状态 */
  networkOk: boolean
  states: Record<string, HostState>
}

/** 可配置参数，全部在 App 内可改 */
export type Settings = {
  /** 单次探测超时（秒）。这个值同时也是「离线」的判定门槛 */
  timeoutSec: number
  /** 一轮里失败后额外重试几次（「不通就持续 ping 几下」） */
  retries: number
  /** 重试之间的基础间隔（毫秒），第 n 次重试等 n 倍 */
  retryGapMs: number
  /** 连续失败几轮才标记为离线（「再不通才标记离线」） */
  failThreshold: number
  /** 退避基数（分钟） */
  backoffBaseMin: number
  /** 退避倍率 */
  backoffFactor: number
  /** 退避上限（分钟） */
  backoffMaxMin: number
  /** 延迟超过这个值显示为「慢」（黄灯，毫秒） */
  degradedMs: number
  /** 期望的小组件刷新间隔（分钟）。只是给系统的建议，实际由 iOS 预算决定 */
  refreshMinutes: number
  /** 允许小组件在被系统刷新时顺手探测。关掉后小组件只显示 App 探测的结果 */
  probeInWidget: boolean
  /** 本机联网哨兵地址：探不通它就认为是手机没网，本轮作废 */
  sentinelUrl: string
  /** 显示开关 */
  showRtt: boolean
  showGeo: boolean
  showSparkline: boolean
  /** 排序方式 */
  sortMode: "custom" | "status" | "alias" | "rtt"
  /** 历史保留点数 */
  historyPoints: number
  /** 主题强调色 */
  accent: string
}

export const DEFAULT_SETTINGS: Settings = {
  timeoutSec: 5,
  retries: 2,
  retryGapMs: 700,
  failThreshold: 2,
  backoffBaseMin: 5,
  backoffFactor: 2,
  backoffMaxMin: 60,
  degradedMs: 800,
  refreshMinutes: 15,
  probeInWidget: true,
  sentinelUrl: "https://1.1.1.1/cdn-cgi/trace",
  showRtt: true,
  showGeo: true,
  showSparkline: true,
  sortMode: "status",
  historyPoints: 288,
  accent: "systemBlue",
}

export const DEFAULT_PROBE: ProbeConfig = {
  type: "tcp",
  port: 22,
}

export function emptyState(): HostState {
  return {
    status: "unknown",
    rtt: -1,
    lastProbeAt: 0,
    lastOnlineAt: 0,
    consecFail: 0,
    nextProbeAt: 0,
    detail: "还没探测过",
    attempts: 0,
    history: [],
  }
}

/**
 * 延迟值消毒。
 * 设备卡顿、系统调度抖动都会让墙上时间变得离谱，直接存进历史会把曲线拉爆。
 * 这里把它夹到合理区间：至少 1ms（0 看着像没测），最多 60s。
 */
export function clampRtt(ms: number): number {
  if (!Number.isFinite(ms)) return -1
  return Math.max(1, Math.min(60_000, Math.round(ms)))
}

/**
 * 由两位国家代码推导国旗 emoji。
 * 用本地计算而不是下载图片 —— 小组件只有 30MB 内存，能省一次网络就省一次。
 */
export function countryFlag(code?: string): string {
  if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code)) return "🏳️"
  const base = 0x1f1e6
  const upper = code.toUpperCase()
  return String.fromCodePoint(
    base + (upper.charCodeAt(0) - 65),
    base + (upper.charCodeAt(1) - 65),
  )
}

/** 状态对应的灯色。语义集中在这里，UI 各处不要各写一套 */
export function statusColor(status: Status): string {
  switch (status) {
    case "online":
      return "systemGreen"
    case "offline":
      return "systemRed"
    case "degraded":
      return "systemOrange"
    default:
      return "systemGray"
  }
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "online":
      return "在线"
    case "offline":
      return "离线"
    case "degraded":
      return "不稳定"
    default:
      return "未知"
  }
}
