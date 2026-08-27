/**
 * CFSM Panel —— 格式化工具（纯函数，可单测）
 */

/** 字节/秒 → 人类可读："855B" "19K" "1.2M" "2.1G" */
export function fmtBytes(v: number): string {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return "0"
  const units = ["B", "K", "M", "G", "T"]
  let u = 0
  let x = n
  while (x >= 1000 && u < units.length - 1) {
    x /= 1000
    u++
  }
  if (u === 0) return `${Math.round(x)}B`
  if (x >= 100) return `${Math.round(x)}${units[u]}`
  const s = x.toFixed(1)
  return `${s.endsWith(".0") ? String(Math.round(x)) : s}${units[u]}`
}

/** 百分比整数："0%" "4%" "100%" */
export function fmtPct(v: number): string {
  const n = Number(v)
  if (!isFinite(n)) return "0%"
  return `${Math.round(Math.min(100, Math.max(0, n)))}%`
}

/** 延迟毫秒："77"（渲染端拼 ms） */
export function fmtMs(v: number): string {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return "—"
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}`
}

/** ISO 大写区域码 → 国旗 emoji（SG→🇸🇬）。非国旗码返回空串 */
export function flagEmoji(region: string): string {
  const r = String(region ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(r)) return ""
  const base = 0x1f1e6
  return String.fromCodePoint(base + r.charCodeAt(0) - 65, base + r.charCodeAt(1) - 65)
}

/** 相对时间："刚刚" "2分钟前" "1小时前"（ts<0 返回 —） */
export function relTime(ts: number, now: number): string {
  const diff = now - ts
  if (!isFinite(diff) || diff < 0) return "—"
  if (diff < 60_000) return "刚刚"
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  return `${Math.floor(hr / 24)}天前`
}

/** 时钟："14:05" */
export function clock(ts: number): string {
  if (!isFinite(ts) || ts <= 0) return "--:--"
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}