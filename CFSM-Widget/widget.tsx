/**
 * CFSM Panel —— 多机在线面板小组件
 *
 * 铁律（VPS-Guard 血泪验证，违反即白屏/冻结）：
 * 1. 一次性渲染：Widget.present() 之后不执行，数据全在之前备好。
 * 2. 执行窗口很窄：fetch 带 5s 硬超时，失败降级缓存渲染，绝不白屏。
 * 3. 内存 ~30MB：不加载图片，视图克制。
 *
 * 模式分流（Script.widgetParameter）：
 *   空 / overview → 总览：每台显示 三网延迟（电/联/移）+ 总流量消耗
 *   resources     → 资源：CPU / RAM / DISK 三条进度
 * （v1.0.2 起 ping 模式并入总览——总览已含三网延迟）
 *
 * 对齐策略（v1.0.1 浩浩反馈"主机名长短不齐"）：
 *   名字列按字符数估算定宽截断；数字列全部右对齐 + monospacedDigit，
 *   整行统一字号（不再大字小字混排）。
 */

import {
  Button,
  Capsule,
  Circle,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
  type VirtualNode,
} from "scripting"

import { type CfsmServer, type CfsmSnapshot, type PanelColor, type WidgetMode } from "./types"
import { loadForWidget, loadSettings } from "./api"
import { RefreshIntent } from "./app_intents"

// ---------------------------------------------------------------- 布局预算

type RowDensity = {
  rowFont: "footnote" | "caption" | "caption2"
  dot: number
  barH: number
  barW: number
  spacing: number
  /** 名字列最大宽度（pt）：主机名长短不齐会导致数值列错位，定宽截断 */
  nameMax: number
}

function densityFor(family: string, count: number): RowDensity {
  const large = family === "systemLarge"
  if (large) {
    const roomy = count <= 12
    return {
      rowFont: roomy ? "footnote" : "caption2",
      dot: roomy ? 9 : 7,
      barH: roomy ? 7 : 5,
      barW: roomy ? 34 : 24,
      spacing: roomy ? 5 : 3,
      nameMax: roomy ? 76 : 70,
    }
  }
  if (family === "systemMedium") {
    return {
      rowFont: "caption",
      dot: 8,
      barH: 6,
      barW: 28,
      spacing: 4,
      nameMax: 64,
    }
  }
  // systemSmall —— 只给摘要，不做列表
  return {
    rowFont: "caption2",
    dot: 7,
    barH: 5,
    barW: 20,
    spacing: 3,
    nameMax: 0,
  }
}

/** 名字列宽度：按字符数估算（中文≈9.5pt，英文≈6pt），封顶 nameMax */
function nameWidth(s: CfsmServer, d: RowDensity): number {
  const per = d.rowFont === "caption2" ? 8 : 10
  return Math.min(d.nameMax, Math.max(20, s.name.length * per + 6))
}

/** 数值列固定宽度（右对齐）：百分比 3 字符 / 网速 5 字符 / 延迟 4 字符 */
const PCT_W = 30
const NET_W = 48
const PING_W = 36

// ---------------------------------------------------------------- 零件

/** 在线状态灯：双层圆（光晕 + 实心），离线灰红 */
function Dot({ online, size }: { online: boolean; size: number }): VirtualNode {
  const color: PanelColor = online ? "systemGreen" : "systemRed"
  return (
    <ZStack frame={{ width: size + 6, height: size + 6 }}>
      <Circle fill={color} opacity={0.2} frame={{ width: size + 6, height: size + 6 }} />
      <Circle fill={color} frame={{ width: size, height: size }} />
    </ZStack>
  )
}

/** 迷你进度条（Capsule 双层），宽度按百分比（resources 模式用） */
function MiniBar({
  pct,
  width,
  height,
  color = "systemGreen",
}: {
  pct: number
  width: number
  height: number
  color?: PanelColor
}): VirtualNode {
  const p = Math.min(100, Math.max(0, pct))
  const fw = Math.max(height, (width * p) / 100)
  return (
    <ZStack frame={{ width, height }}>
      <Capsule fill="quaternaryLabel" frame={{ width, height }} />
      <Capsule fill={color} frame={{ width: fw, height }} />
    </ZStack>
  )
}

/** 状态颜色：CPU/RAM/磁盘 超阈值预警 */
function usageColor(pct: number): PanelColor {
  if (pct >= 95) return "systemRed"
  if (pct >= 85) return "systemOrange"
  return "systemGreen"
}

/**
 * 单台行（总览模式）：● 名字   77 / 127 / 78   119G
 * 三网延迟按 电信/联通/移动 排序（丢包>10% 或 ≥500ms 标橙，离线标红）
 * 总流量 = 累计下行 + 累计上行（net_rx + net_tx）
 */
function OverviewRow({ s, d }: { s: CfsmServer; d: RowDensity }): VirtualNode {
  const off = !s.online

  const pingCell = (ms: number, loss: number, isLast: boolean) => {
    const bad = ms >= 500 || loss > 10
    return (
      <HStack spacing={2}>
        <Text
          font={d.rowFont}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.75}
          foregroundStyle={off ? "systemRed" : bad ? "systemOrange" : "secondaryLabel"}
          frame={{ width: PING_W, alignment: "trailing" }}
        >
          {off ? "—" : fmtMs(ms)}
        </Text>
        {isLast ? null : (
          <Text font={d.rowFont} opacity={0.4}>
            /
          </Text>
        )}
      </HStack>
    )
  }

  return (
    <HStack spacing={d.spacing} opacity={off ? 0.55 : 1}>
      <Dot online={s.online} size={d.dot} />
      <Text
        font={d.rowFont}
        fontWeight="medium"
        lineLimit={1}
        minScaleFactor={0.8}
        foregroundStyle="label"
        frame={{ width: nameWidth(s, d), alignment: "leading" }}
      >
        {s.name}
      </Text>

      <Spacer minLength={2} />

      {pingCell(s.pingCt, s.lossCt, false)}
      {pingCell(s.pingCu, s.lossCu, false)}
      {pingCell(s.pingCm, s.lossCm, true)}

      <Spacer minLength={10} />

      <Text
        font={d.rowFont}
        monospacedDigit
        lineLimit={1}
        minScaleFactor={0.8}
        foregroundStyle={off ? "systemRed" : "label"}
        frame={{ width: NET_W, alignment: "trailing" }}
      >
        {off ? "—" : fmtBytes(s.netRx + s.netTx)}
      </Text>
    </HStack>
  )
}

/** 单台行（资源模式）：● 名  [CPU][RAM][DSK] */
function ResourceRow({ s, d }: { s: CfsmServer; d: RowDensity }): VirtualNode {
  const off = !s.online
  const bar = (pct: number) => (
    <MiniBar pct={pct} width={d.barW} height={d.barH} color={usageColor(pct)} />
  )
  return (
    <HStack spacing={d.spacing} opacity={off ? 0.55 : 1}>
      <Dot online={s.online} size={d.dot} />
      <Text
        font={d.rowFont}
        fontWeight="medium"
        lineLimit={1}
        minScaleFactor={0.8}
        foregroundStyle="label"
        frame={{ width: nameWidth(s, d), alignment: "leading" }}
      >
        {s.name}
      </Text>
      <Spacer minLength={2} />
      {bar(s.cpu)}
      <Text
        font={d.rowFont}
        monospacedDigit
        foregroundStyle="secondaryLabel"
        opacity={0.9}
        frame={{ width: PCT_W, alignment: "trailing" }}
      >
        {off ? "—" : fmtPct(s.cpu)}
      </Text>
      <Spacer minLength={4} />
      {bar(s.ramPct)}
      <Text
        font={d.rowFont}
        monospacedDigit
        foregroundStyle="secondaryLabel"
        opacity={0.9}
        frame={{ width: PCT_W, alignment: "trailing" }}
      >
        {off ? "—" : fmtPct(s.ramPct)}
      </Text>
      <Spacer minLength={4} />
      {bar(s.diskPct)}
      <Text
        font={d.rowFont}
        monospacedDigit
        foregroundStyle="secondaryLabel"
        opacity={0.9}
        frame={{ width: PCT_W, alignment: "trailing" }}
      >
        {off ? "—" : fmtPct(s.diskPct)}
      </Text>
    </HStack>
  )
}// ---------------------------------------------------------------- 骨架

/** 标题行：站点名 + 在线统计 + 列头说明 */
function Header({
  snap,
  mode,
  compact,
}: {
  snap: CfsmSnapshot
  mode: WidgetMode
  compact?: boolean
}): VirtualNode {
  const right =
    mode === "resources" ? (
      <Text font="caption2" foregroundStyle="secondaryLabel">
        资源占用
      </Text>
    ) : (
      <Text font="caption2" foregroundStyle="secondaryLabel">
        电 / 联 / 移 · 流量
      </Text>
    )

  return (
    <HStack spacing={6}>
      <Image
        systemName={snap.offline > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"}
        imageScale="small"
        foregroundStyle={snap.offline > 0 ? "systemOrange" : "systemGreen"}
      />
      <Text font="footnote" fontWeight="semibold" lineLimit={1} foregroundStyle="label">
        {snap.online}/{snap.total}
      </Text>
      <Spacer minLength={2} />
      {compact ? null : right}
    </HStack>
  )
}

/** systemSmall：红绿灯摘要（在线 N/M + 离线点名） */
function SmallSummary({ snap }: { snap: CfsmSnapshot }): VirtualNode {
  const offlineNames = snap.servers.filter(s => !s.online).map(s => s.name).slice(0, 3)
  return (
    <VStack spacing={8} padding={12}>
      <Header snap={snap} mode="overview" compact />
      <Spacer />
      <VStack spacing={2}>
        <HStack spacing={2} alignment="bottom">
          <Text font="title3" fontWeight="bold" monospacedDigit foregroundStyle="label">
            {snap.online}
          </Text>
          <Text font="caption" foregroundStyle="secondaryLabel">
            / {snap.total}
          </Text>
        </HStack>
        <Text font="caption2" foregroundStyle="secondaryLabel">
          在线
        </Text>
      </VStack>
      <Spacer />
      {offlineNames.length > 0 ? (
        <Text font="caption2" foregroundStyle="systemOrange" lineLimit={2} minScaleFactor={0.75}>
          离线：{offlineNames.join("、")}
        </Text>
      ) : (
        <Text font="caption2" foregroundStyle="secondaryLabel">
          全部在线
        </Text>
      )}
      <Footer snap={snap} stale={false} />
    </VStack>
  )
}

/** 底部：数据时间、离线汇总 与 立即刷新按钮 */
function Footer({ snap, stale }: { snap: CfsmSnapshot; stale: boolean }): VirtualNode {
  return (
    <HStack spacing={6}>
      {snap.offline > 0 ? (
        <Text font="caption2" foregroundStyle="systemOrange" lineLimit={1} minScaleFactor={0.8}>
          离线 {snap.offline} 台
        </Text>
      ) : (
        <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>
          全部在线
        </Text>
      )}
      <Spacer />
      <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1} minScaleFactor={0.8}>
        {stale ? `缓存 ${relTime(snap.savedAt, Date.now())}` : clock(snap.savedAt)}
      </Text>
      <Button intent={RefreshIntent(undefined)}>
        <Image systemName="arrow.clockwise" imageScale="small" widgetAccentable />
      </Button>
    </HStack>
  )
}

/** 首次使用/连接失败的错误视图 */
function ErrView(msg: string): VirtualNode {
  return (
    <VStack spacing={6} padding={12}>
      <Image systemName="wifi.exclamationmark" imageScale="medium" foregroundStyle="systemOrange" />
      <Text font="caption" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        {msg}
      </Text>
      <Text font="caption2" foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
        在 App 设置里填写面板地址
      </Text>
    </VStack>
  )
}

/** parameter → 模式（v1.0.2 起 ping 并入总览） */
function modeOf(param: string): WidgetMode {
  const p = String(param ?? "").trim().toLowerCase()
  if (p === "resources" || p === "resource") return "resources"
  return "overview"
}

/** 每种尺寸最多渲染几行（在线优先，超出截断，底部提示） */
function rowCapacity(family: string, count: number): number {
  if (family === "systemLarge") return count <= 12 ? 11 : 15
  if (family === "systemMedium") return 5
  return 0
}

/** 主面板：标题 + 行列表 + 底部状态 */
function Panel({
  snap,
  mode,
  family,
  stale,
}: {
  snap: CfsmSnapshot
  mode: WidgetMode
  family: string
  stale: boolean
}): VirtualNode {
  if (family === "systemSmall") return SmallSummary({ snap })

  const d = densityFor(family, snap.servers.length)
  const cap = rowCapacity(family, snap.servers.length)
  const onlineFirst = [...snap.servers].sort((a, b) => Number(b.online) - Number(a.online))
  const list = cap > 0 ? onlineFirst.slice(0, cap) : onlineFirst

  const R = mode === "resources" ? ResourceRow : OverviewRow

  return (
    <VStack spacing={7} padding={12}>
      <Header snap={snap} mode={mode} />
      <VStack spacing={d.spacing}>
        {list.map(s => (
          <R key={s.id} s={s} d={d} />
        ))}
      </VStack>
      {list.length < snap.servers.length ? (
        <Text font="caption2" opacity={0.6} lineLimit={1}>
          还有 {snap.servers.length - list.length} 台未显示
        </Text>
      ) : null}
      <Spacer />
      <Footer snap={snap} stale={stale} />
    </VStack>
  )
}

/** 入口：数据全部在 present 前备好 */
async function main(): Promise<void> {
  const family = String(Widget.family ?? "systemMedium")
  const mode = modeOf(String(Widget.parameter ?? ""))

  const settings = loadSettings()
  if (!settings.baseURL) {
    Widget.present(ErrView("未配置面板地址"))
    return
  }

  try {
    const { snap, stale } = await loadForWidget(settings)
    Widget.present(<Panel snap={snap} mode={mode} family={family} stale={stale} />)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    Widget.present(ErrView(msg))
  }
}

main()