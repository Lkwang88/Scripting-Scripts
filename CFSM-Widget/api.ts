/**
 * CFSM Panel —— API 访问层
 * 一次 /api/servers 拉全站，提取精简字段进 Storage 缓存。
 * 挂件渲染走缓存优先，fetch 失败降级缓存显示（绝不白屏）。
 */
import { type CfsmServer, type CfsmSettings, type CfsmSnapshot } from "./types"

const SNAP_KEY = "cfsm.snapshot.v1"
const SETTINGS_KEY = "cfsm.settings.v1"

/** CF 官方在线阈值：5 分钟无上报视为离线 */
const OFFLINE_MS = 300_000
/** 挂件内单次请求超时（必须在 WidgetKit 执行窗口内完成） */
const FETCH_TIMEOUT_MS = 5_000

// ---------------------------------------------------------------- Storage

export function loadSettings(): CfsmSettings {
  const s = Storage.get(SETTINGS_KEY) as Partial<CfsmSettings> | null
  return { baseURL: s?.baseURL ?? "", token: s?.token ?? "" }
}

export function saveSettings(s: CfsmSettings): void {
  Storage.set(SETTINGS_KEY, { baseURL: s.baseURL.trim().replace(/\/+$/, ""), token: s.token?.trim() ?? "" })
}

export function loadSnapshot(): CfsmSnapshot | null {
  return Storage.get(SNAP_KEY) as CfsmSnapshot | null
}

export function saveSnapshot(s: CfsmSnapshot): void {
  Storage.set(SNAP_KEY, s)
}

// ---------------------------------------------------------------- 提取

/** 原始 /api/servers 响应里单台服务器的字段（只取渲染需要的） */
interface RawServer {
  id: string
  name: string
  region: string
  cpu?: number
  ram_total?: number
  ram_used?: number
  disk_total?: number
  disk_used?: number
  net_in_speed?: number
  net_out_speed?: number
  ping_ct?: number
  ping_cu?: number
  ping_cm?: number
  loss_ct?: number
  loss_cu?: number
  loss_cm?: number
  net_rx?: number
  net_tx?: number
  net_rx_monthly?: number
  net_tx_monthly?: number
  last_updated?: number
}

function pct(used: unknown, total: unknown): number {
  const u = Number(used)
  const t = Number(total)
  if (!isFinite(u) || !isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.max(0, (u / t) * 100))
}

function num(v: unknown): number {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

export function extractServers(raw: unknown[] | undefined, now: number): CfsmServer[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r): CfsmServer => {
    const s = (r ?? {}) as RawServer
    const lastUpdated = num(s.last_updated)
    return {
      id: String(s.id ?? ""),
      name: String(s.name ?? s.id ?? "?"),
      region: String(s.region ?? "").toUpperCase(),
      online: now - lastUpdated <= OFFLINE_MS,
      cpu: num(s.cpu),
      ramPct: pct(s.ram_used, s.ram_total),
      diskPct: pct(s.disk_used, s.disk_total),
      netIn: num(s.net_in_speed),
      netOut: num(s.net_out_speed),
      pingCt: num(s.ping_ct),
      pingCu: num(s.ping_cu),
      pingCm: num(s.ping_cm),
      lossCt: num(s.loss_ct),
      lossCu: num(s.loss_cu),
      lossCm: num(s.loss_cm),
      netRx: num(s.net_rx),
      netTx: num(s.net_tx),
      netRxMonth: num(s.net_rx_monthly),
      netTxMonth: num(s.net_tx_monthly),
      lastUpdated,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function buildSnapshot(raw: unknown, now: number): CfsmSnapshot {
  const body = (raw ?? {}) as {
    servers?: unknown[]
    stats?: { total?: number; online?: number; offline?: number; globalSpeedIn?: number; globalSpeedOut?: number }
  }
  const st = body.stats ?? {}
  const servers = extractServers(body.servers, now)
  return {
    savedAt: now,
    total: num(st.total) || servers.length,
    online: num(st.online),
    offline: num(st.offline),
    globalIn: num(st.globalSpeedIn),
    globalOut: num(st.globalSpeedOut),
    servers,
  }
}

// ---------------------------------------------------------------- 拉取

/**
 * 抓取全站快照。成功写缓存；失败抛错（调用方降级缓存渲染）。
 * headers：可选 Bearer JWT（公开站不需要）。
 */
export async function fetchServers(settings: CfsmSettings, now?: number): Promise<CfsmSnapshot> {
  const base = settings.baseURL.trim().replace(/\/+$/, "")
  const t0 = now ?? Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    }
    if (settings.token) headers.Authorization = `Bearer ${settings.token}`
    const res = await fetch(`${base}/api/servers`, { headers, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const snap = buildSnapshot(await res.json(), t0)
    saveSnapshot(snap)
    return snap
  } finally {
    clearTimeout(timer)
  }
}

/** 挂件统一入口：先抓取，失败降级缓存（显示旧数据+时间戳） */
export async function loadForWidget(settings: CfsmSettings): Promise<{ snap: CfsmSnapshot; stale: boolean }> {
  try {
    return { snap: await fetchServers(settings), stale: false }
  } catch {
    const cached = loadSnapshot()
    if (cached) return { snap: cached, stale: true }
    throw new Error("无法连接面板")
  }
}