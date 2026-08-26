/**
 * 小组件渲染层。
 *
 * 铁律（违反任何一条小组件都会白屏或被系统杀掉）：
 * 1. 一次性渲染，hooks 全部无效 —— 这里没有 useState/useEffect。
 * 2. Widget.present() 之后的代码不会执行，所有准备工作必须在它之前做完。
 * 3. 内存上限约 30MB —— 视图数量要克制，不加载任何图片资源，国旗用 emoji。
 * 4. 系统给的执行时间很短 —— 探测必须带硬预算，宁可少探几台也不能超时。
 *
 * 布局策略（台数会慢慢变多，所以全部按台数自适应）：
 *   accessoryCircular    → 一个环，显示在线比例
 *   accessoryRectangular → 一行摘要
 *   systemSmall          → 有 parameter 就单机特写，否则摘要 + 异常点名
 *   systemMedium         → 摘要 + 异常优先的紧凑列表
 *   systemLarge          → 全量列表；台数多时自动降密度（去掉迷你图/地区）
 */

import {
  Button,
  Circle,
  Capsule,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
  type VirtualNode,
} from "scripting"

import {
  type Host,
  type HostState,
  type Settings,
  type Snapshot,
  statusColor,
  type Status,
} from "./types"
import {
  loadHosts,
  loadSettings,
  loadSnapshot,
  saveSnapshot,
  sortHosts,
  stateOf,
} from "./store"
import { runRound } from "./probe"
import { RefreshIntent } from "./app_intents"
import {
  fmtRtt,
  overallStatus,
  relTimeShort,
  sparkPoints,
  tally,
  type Tally,
} from "./format"

// ---------------------------------------------------------------- 布局预算

/**
 * 每种尺寸最多显示几行。数字是按 iPhone 上的实际点数估的：
 * large 约 340pt 高，头尾各占 ~30pt，每行 26pt，于是 11 行封顶。
 */
function rowCapacity(family: string): number {
  switch (family) {
    case "systemLarge":
      return 11
    case "systemMedium":
      return 4
    case "systemSmall":
      return 3
    default:
      return 1
  }
}

/** 台数多了就降密度 —— 精致的前提是不挤 */
type Density = {
  showSpark: boolean
  showGeo: boolean
  rowFont: "caption" | "caption2" | "footnote"
  dot: number
  spacing: number
}

function densityFor(family: string, count: number, settings: Settings): Density {
  if (family === "systemLarge") {
    const roomy = count <= 6
    return {
      showSpark: settings.showSparkline && count <= 8,
      showGeo: settings.showGeo,
      rowFont: roomy ? "footnote" : "caption",
      dot: roomy ? 9 : 8,
      spacing: roomy ? 7 : 4,
    }
  }
  if (family === "systemMedium") {
    return {
      showSpark: false,
      showGeo: settings.showGeo && count <= 3,
      rowFont: "caption",
      dot: 8,
      spacing: 4,
    }
  }
  return {
    showSpark: false,
    showGeo: false,
    rowFont: "caption2",
    dot: 7,
    spacing: 3,
  }
}

// ---------------------------------------------------------------- 零件

/**
 * 状态灯。外圈用同色低透明度做一层光晕，比纯色圆点显得精致，
 * 而且离线时红色更醒目。两个视图换一点质感，值得。
 */
function Dot({
  status,
  size,
}: {
  status: Status
  size: number
}): VirtualNode {
  const color = statusColor(status)
  return (
    <ZStack frame={{ width: size + 6, height: size + 6 }}>
      <Circle fill={color} opacity={0.22} frame={{ width: size + 6, height: size + 6 }} />
      <Circle fill={color} frame={{ width: size, height: size }} />
    </ZStack>
  )
}

/**
 * 迷你延迟图。用 Capsule 竖条拼，不用 Chart —— 小组件里视图越少越安全。
 * 失败的点画成低透明度的红条，一眼能看出「什么时候断过」。
 */
function Spark({
  state,
  points,
  height,
}: {
  state: HostState
  points: number
  height: number
}): VirtualNode {
  const vals = sparkPoints(state.history, points)
  if (vals.length === 0) {
    return <HStack frame={{ width: 34, height }} />
  }
  const ok = vals.filter(v => v >= 0)
  const max = ok.length > 0 ? Math.max(...ok) : 1
  const floor = Math.max(2, height * 0.18)

  return (
    <HStack spacing={1.5} alignment="bottom" frame={{ width: 34, height }}>
      {vals.map((v, i) => {
        const failed = v < 0
        const ratio = failed || max <= 0 ? 1 : Math.max(0.12, v / max)
        return (
          <Capsule
            key={i}
            fill={failed ? "systemRed" : "systemGreen"}
            opacity={failed ? 0.45 : 0.75}
            frame={{ width: 2.5, height: failed ? floor : Math.max(floor, ratio * height) }}
          />
        )
      })}
    </HStack>
  )
}

/** 一行主机 */
function Row({
  host,
  state,
  density,
  settings,
}: {
  host: Host
  state: HostState
  density: Density
  settings: Settings
}): VirtualNode {
  const dim = host.paused === true
  return (
    <HStack spacing={6} opacity={dim ? 0.45 : 1}>
      <Dot status={host.paused === true ? "unknown" : state.status} size={density.dot} />

      <Text
        font={density.rowFont}
        fontWeight="medium"
        lineLimit={1}
        minScaleFactor={0.85}
        foregroundStyle="label"
      >
        {host.alias}
      </Text>

      {density.showGeo && host.geo != null ? (
        <Text font="caption2" opacity={0.75}>
          {host.geo.flag}
        </Text>
      ) : null}

      <Spacer minLength={2} />

      {density.showSpark ? (
        <Spark state={state} points={10} height={12} />
      ) : null}

      {settings.showRtt ? (
        <Text
          font={density.rowFont}
          monospacedDigit
          foregroundStyle={
            state.status === "offline"
              ? "systemRed"
              : state.status === "degraded"
                ? "systemOrange"
                : "secondaryLabel"
          }
        >
          {host.paused === true ? "暂停" : fmtRtt(state.rtt)}
        </Text>
      ) : null}
    </HStack>
  )
}

/** 顶部条：一眼看清整体 */
function Header({
  t,
  snap,
  compact,
}: {
  t: Tally
  snap: Snapshot
  compact: boolean
}): VirtualNode {
  const overall = overallStatus(t)
  return (
    <HStack spacing={6}>
      <Image
        systemName={
          snap.networkOk
            ? overall === "online"
              ? "checkmark.circle.fill"
              : overall === "offline"
                ? "exclamationmark.triangle.fill"
                : "exclamationmark.circle.fill"
            : "wifi.slash"
        }
        imageScale={compact ? "small" : "medium"}
        foregroundStyle={snap.networkOk ? statusColor(overall) : "systemGray"}
        widgetAccentable
      />
      <Text
        font={compact ? "caption" : "footnote"}
        fontWeight="semibold"
        foregroundStyle="label"
        widgetAccentable
      >
        {snap.networkOk ? `${t.online}/${t.total} 在线` : "本机无网络"}
      </Text>
      <Spacer />
      {snap.updatedAt > 0 ? (
        <Text font="caption2" foregroundStyle="tertiaryLabel">
          {relTimeShort(snap.updatedAt)}
        </Text>
      ) : null}
      <Button intent={RefreshIntent(undefined)}>
        <Image
          systemName="arrow.clockwise"
          imageScale={compact ? "small" : "medium"}
          widgetAccentable
        />
      </Button>
    </HStack>
  )
}

/** 没有主机时的引导 */
function Empty(): VirtualNode {
  return (
    <VStack spacing={6} padding={12}>
      <Image systemName="server.rack" imageScale="large" foregroundStyle="secondaryLabel" />
      <Text font="caption" fontWeight="medium" foregroundStyle="label">
        还没有添加服务器
      </Text>
      <Text font="caption2" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        打开脚本添加，支持 IP 或域名
      </Text>
    </VStack>
  )
}

// ---------------------------------------------------------------- 各尺寸视图

function CircularView({ t }: { t: Tally }): VirtualNode {
  const ratio = t.total > 0 ? t.online / t.total : 0
  return (
    <ZStack>
      <Circle
        stroke={{ shapeStyle: "systemGray", strokeStyle: { lineWidth: 5 } }}
        opacity={0.25}
      />
      <Circle
        trim={{ from: 0, to: Math.max(0.02, ratio) }}
        stroke={{
          shapeStyle: statusColor(overallStatus(t)),
          strokeStyle: { lineWidth: 5, lineCap: "round" },
        }}
        rotationEffect={{ degrees: -90, anchor: "center" }}
      />
      <VStack spacing={0}>
        <Text font="caption" fontWeight="bold" monospacedDigit>
          {t.online}
        </Text>
        <Text font="caption2" foregroundStyle="secondaryLabel" monospacedDigit>
          /{t.total}
        </Text>
      </VStack>
    </ZStack>
  )
}

function RectangularView({
  t,
  snap,
  bad,
}: {
  t: Tally
  snap: Snapshot
  bad: { host: Host; state: HostState }[]
}): VirtualNode {
  return (
    <VStack alignment="leading" spacing={1}>
      <HStack spacing={4}>
        <Image
          systemName={t.offline > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"}
          imageScale="small"
          widgetAccentable
        />
        <Text font="caption" fontWeight="semibold" widgetAccentable>
          {snap.networkOk ? `VPS ${t.online}/${t.total}` : "本机无网络"}
        </Text>
      </HStack>
      <Text font="caption2" lineLimit={1} foregroundStyle="secondaryLabel">
        {bad.length > 0
          ? `${bad[0].host.alias} 离线`
          : snap.updatedAt > 0
            ? `全部正常・${relTimeShort(snap.updatedAt)}`
            : "尚未探测"}
      </Text>
    </VStack>
  )
}

/** 单机特写：小尺寸配 parameter 时用，一眼看一台重点机器 */
function FocusView({
  host,
  state,
  settings,
}: {
  host: Host
  state: HostState
  settings: Settings
}): VirtualNode {
  return (
    <VStack alignment="leading" spacing={4}>
      <HStack spacing={5}>
        <Dot status={state.status} size={9} />
        <Text font="footnote" fontWeight="semibold" lineLimit={1} minScaleFactor={0.8}>
          {host.alias}
        </Text>
        <Spacer />
      </HStack>

      <Spacer minLength={0} />

      <HStack spacing={3} alignment="bottom">
        <Text
          font="title"
          fontWeight="bold"
          monospacedDigit
          foregroundStyle={statusColor(state.status)}
        >
          {state.rtt >= 0 ? String(state.rtt) : "—"}
        </Text>
        {state.rtt >= 0 ? (
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ bottom: 3 }}>
            ms
          </Text>
        ) : null}
      </HStack>

      {settings.showSparkline ? <Spark state={state} points={14} height={16} /> : null}

      <Spacer minLength={0} />

      <VStack alignment="leading" spacing={1}>
        {settings.showGeo && host.geo != null ? (
          <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
            {host.geo.flag} {host.geo.city || host.geo.country}
          </Text>
        ) : null}
        <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
          {state.lastProbeAt > 0 ? relTimeShort(state.lastProbeAt) : "尚未探测"}
        </Text>
      </VStack>
    </VStack>
  )
}

function ListView({
  hosts,
  snap,
  settings,
  family,
  t,
}: {
  hosts: Host[]
  snap: Snapshot
  settings: Settings
  family: string
  t: Tally
}): VirtualNode {
  const cap = rowCapacity(family)
  const shown = hosts.slice(0, cap)
  const hidden = hosts.length - shown.length
  const density = densityFor(family, shown.length, settings)
  const compact = family !== "systemLarge"

  return (
    <VStack alignment="leading" spacing={density.spacing}>
      <Header t={t} snap={snap} compact={compact} />

      {shown.map(host => (
        <Row
          key={host.id}
          host={host}
          state={stateOf(snap, host.id)}
          density={density}
          settings={settings}
        />
      ))}

      <Spacer minLength={0} />

      {hidden > 0 ? (
        <Text font="caption2" foregroundStyle="tertiaryLabel">
          还有 {hidden} 台未显示
        </Text>
      ) : null}
    </VStack>
  )
}

// ---------------------------------------------------------------- 入口

// 小组件探测的固定安全参数（不进设置页，避免误配出白屏）：
// 每次系统刷新 2 并发探一遍（预算 12s、单次 2s 超时兜底），
// 结果只用于本次渲染，不写回 Storage —— 快照时间戳只由 App 推进，
// 右上角才能显示真实的「距上次完整探测」而不是永远 0s。
const WIDGET_TIMEOUT_SEC = 2
const WIDGET_BUDGET_MS = 12000
// 请求系统刷新的最短间隔（分钟）。WidgetKit 并不严格尊重这个值，
// 但浩浩要最短 → 固定 15，不再做成可配置项。
const WIDGET_REFRESH_MIN = 15

async function main() {
  try {
    await render()
  } catch {
    // 任何异常都要给出可见内容，绝不白屏
    Widget.present(
      <Text font="caption" foregroundStyle="secondaryLabel">加载失败，请打开 App 刷新</Text>
    )
  }
}

async function render() {
  const family = Widget.family
  const settings = loadSettings()
  const hosts = loadHosts()
  let snap = loadSnapshot()

  // 系统每次刷新小组件时顺手探几台 —— 数据新鲜度就来自这里。
  // v1.0.3 曾把这段砍掉（当时误判白屏根因是异步探测，真凶是 Widget
  // 未导入），结果小组件永远画旧快照，时间戳只有打开 App 才会动。
  if (hosts.length > 0) {
    try {
      const wSettings = { ...settings, timeoutSec: WIDGET_TIMEOUT_SEC, retries: 0 }
      // 全量并行：预算 8s 内一次探完所有主机（单台 2s 超时兜底）。
      // 不写回 Storage —— 见上方 WIDGET_BUDGET_MS 注释。
      snap = await runRound(hosts, snap, wSettings, {
        budgetMs: WIDGET_BUDGET_MS,
      })
    } catch (e) {
      // 探测失败就用上次的快照渲染
      console.log("[widget] 探测失败:", String((e as { message?: string })?.message ?? e))
    }
  }

  const sorted = sortHosts(hosts, snap, settings.sortMode)
  const t = tally(sorted.map(x => (x.paused === true ? "unknown" : stateOf(snap, x.id).status)))
  const bad = sorted
    .filter(x => x.paused !== true)
    .map(x => ({ host: x, state: stateOf(snap, x.id) }))
    .filter(x => x.state.status === "offline" || x.state.status === "degraded")

  let body: VirtualNode

  if (hosts.length === 0) {
    body = <Empty />
  } else if (family === "accessoryCircular") {
    body = <CircularView t={t} />
  } else if (family === "accessoryRectangular") {
    body = <RectangularView t={t} snap={snap} bad={bad} />
  } else if (family === "systemSmall") {
    // parameter 填了别名或 IP 就单机特写 —— 同一份代码，多个实例各看一台
    const key = (Widget.parameter ?? "").trim().toLowerCase()
    const focus =
      key.length > 0
        ? sorted.find(
            x =>
              x.alias.toLowerCase() === key ||
              x.address.toLowerCase() === key ||
              x.ip.toLowerCase() === key,
          )
        : undefined
    body =
      focus != null ? (
        <FocusView host={focus} state={stateOf(snap, focus.id)} settings={settings} />
      ) : (
        <ListView
          hosts={sorted}
          snap={snap}
          settings={settings}
          family={family}
          t={t}
        />
      )
  } else {
    body = (
      <ListView hosts={sorted} snap={snap} settings={settings} family={family} t={t} />
    )
  }

  // 锁屏配件不要自绘背景，交给系统
  const isAccessory = family.startsWith("accessory")

  const root = isAccessory ? (
    body
  ) : (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      padding={{ horizontal: 12, vertical: 10 }}
      widgetBackground="systemBackground"
    >
      {body}
    </VStack>
  )

  // 给系统一个明确的刷新时间点（文档支持的形态）。
  // 注意：这只是「请求」，iOS 按预算调度，实际通常 15~60 分钟一次，
  // 手机闲置/夜间会更懒 —— 这是平台天花板，不是 bug。
  const next = new Date(Date.now() + WIDGET_REFRESH_MIN * 60_000)
  Widget.present(root, { policy: "after", date: next })
}

main()
