/**
 * 纯展示用的格式化工具。App 和小组件共用，保证两边说法一致。
 * 这里不碰 Storage、不发网络请求，纯函数，方便单测。
 */

import { type HostState, type Sample, type Status } from "./types"

/** 相对时间：刚刚 / 3 分钟前 / 2 小时前 / 3 天前 */
export function relTime(ts: number, now = Date.now()): string {
  if (!ts) return "从未"
  const sec = Math.max(0, Math.round((now - ts) / 1000))
  if (sec < 45) return "刚刚"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.round(hour / 24)
  return `${day} 天前`
}

/** 极简相对时间，给空间紧张的小组件用：45s / 12m / 3h / 2d */
export function relTimeShort(ts: number, now = Date.now()): string {
  if (!ts) return "—"
  const sec = Math.max(0, Math.round((now - ts) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour}h`
  return `${Math.round(hour / 24)}d`
}

/** 时钟：14:05 */
export function clockTime(ts: number): string {
  if (!ts) return "--:--"
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * 延迟显示。-1 表示没有数据。
 *
 * 带单位是有意的：三处调用点（小组件行、详情行、测试连通性的提示语）都是
 * 直接把它塞进一段文字里，没有独立的单位标签跟着。裸数字在那些位置会有歧义。
 * 超过 1 秒改用秒 —— "1.2k" 不是时间单位。
 */
export function fmtRtt(rtt: number): string {
  if (rtt < 0) return "—"
  if (rtt < 1000) return `${rtt}ms`
  return `${(rtt / 1000).toFixed(1)}s`
}

/** 可用率：历史里成功点数占比 */
export function uptimeRatio(state: HostState): number | null {
  if (!state.history.length) return null
  const ok = state.history.filter(s => s.r >= 0).length
  return ok / state.history.length
}

export function fmtUptime(state: HostState): string {
  const r = uptimeRatio(state)
  if (r == null) return "—"
  const pct = r * 100
  // 99.95% 这种别显示成 100%，会误导
  if (pct >= 99.95 && r < 1) return "99.9%"
  return `${pct.toFixed(pct >= 99.9 ? 1 : 0)}%`
}

/** 平均延迟，只统计成功点 */
export function avgRtt(state: HostState): number | null {
  const ok = state.history.filter(s => s.r >= 0)
  if (!ok.length) return null
  return Math.round(ok.reduce((a, s) => a + s.r, 0) / ok.length)
}

/** 抖动：成功点延迟的极差，能看出线路稳不稳 */
export function jitter(state: HostState): number | null {
  const ok = state.history.filter(s => s.r >= 0).map(s => s.r)
  if (ok.length < 2) return null
  return Math.max(...ok) - Math.min(...ok)
}

/**
 * 把历史抽稀成 n 个点用于画迷你折线。
 * 取每段的中位数而不是平均值 —— 一次抽风不会把整段拉高。
 */
export function sparkPoints(history: Sample[], n: number): number[] {
  if (!history.length || n <= 0) return []
  const src = history.slice(-Math.min(history.length, n * 4))
  const out: number[] = []
  const size = src.length / n
  for (let i = 0; i < n; i++) {
    const seg = src.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1))
    if (!seg.length) {
      out.push(-1)
      continue
    }
    const ok = seg.filter(s => s.r >= 0).map(s => s.r).sort((a, b) => a - b)
    // 段内全失败就记 -1，画成红色断点
    out.push(ok.length ? ok[Math.floor(ok.length / 2)] : -1)
  }
  return out
}

/** 状态摘要：几台在线 / 几台有问题 */
export type Tally = {
  total: number
  online: number
  offline: number
  degraded: number
  unknown: number
  /** 有问题的（离线 + 不稳定） */
  trouble: number
}

export function tally(statuses: Status[]): Tally {
  const t: Tally = {
    total: statuses.length,
    online: 0,
    offline: 0,
    degraded: 0,
    unknown: 0,
    trouble: 0,
  }
  for (const s of statuses) {
    if (s === "online") t.online++
    else if (s === "offline") t.offline++
    else if (s === "degraded") t.degraded++
    else t.unknown++
  }
  t.trouble = t.offline + t.degraded
  return t
}

/** 整体健康度，决定小组件顶部那句话的语气 */
export function overallStatus(t: Tally): Status {
  if (t.total === 0) return "unknown"
  if (t.offline > 0) return "offline"
  if (t.degraded > 0) return "degraded"
  if (t.online > 0) return "online"
  return "unknown"
}

/** 主机在界面上的次要说明行 */
export function stateHint(state: HostState, now = Date.now()): string {
  switch (state.status) {
    case "offline":
      return state.lastOnlineAt
        ? `已离线・上次在线 ${relTime(state.lastOnlineAt, now)}`
        : "离线"
    case "degraded":
      return state.detail || "不稳定"
    case "online":
      return state.detail || "在线"
    default:
      return "等待首次探测"
  }
}
