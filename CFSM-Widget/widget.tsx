/**
 * CFSM Panel —— 多机在线面板小组件
 *
 * 铁律（VPS-Guard 血泪验证，违反即白屏/冻结）：
 * 1. 一次性渲染：Widget.present() 之后不执行，数据全在之前备好。
 * 2. 执行窗口很窄：fetch 带 5s 硬超时，失败降级缓存渲染，绝不白屏。
 * 3. 内存 ~30MB：不加载图片（国旗用 emoji），视图克制。
 *
 * 模式分流（Script.widgetParameter）：
 *   空 / overview → 总览面板（线路状态 + CPU/RAM 条 + 吞吐）
 *   ping          → 三网延迟面板（电信/联通/移动 + 丢包标红）
 *   resources     → 资源面板（CPU/RAM/DISK 三条进度）
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
import { clock, flagEmoji, fmtBytes, fmtMs, fmtPct, relTime } from "./format"

// ---------------------------------------------------------------- 布局预算

/**
 * 每行可用的字体档位。按 VPS-Guard 实测：
 * Large 约 338pt 高，标题 ~30pt + 底部 ~22pt → 行区 ~285pt。
 *   ≤12 台 宽敞档（footnote 行 + 迷你条）：每行 ~26pt → ~11 行
 *   >12   紧凑档（caption2 行去条）：每行 ~19pt → ~15 行
 * Medium 约 158pt 高：标题 ~26pt → 行区 ~130pt，compact 5 行。
 */
type RowDensity = {
  rowFont: "footnote" | "caption" | "caption2"
  dot: number
  barH: number
  barW: number
  showFlag: boolean
  showBars: boolean
  showNet: boolean
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
      showFlag: roomy,
      showBars: roomy,
      showNet: roomy,
      spacing: roomy ? 5 : 3,
      nameMax: roomy ? 88 : 78,
    }
  }
  if (family === "systemMedium") {
    return {
      rowFont: "caption",
      dot: 8,
      barH: 6,
      barW: 28,
      showFlag: false,
      showBars: false,
      showNet: true,
      spacing: 4,
      nameMax: 70,
    }
  }
  // systemSmall —— 只给摘要，不做列表
  return {
    rowFont: "caption2",
    dot: 7,
    barH: 5,
    barW: 20,
    showFlag: false,
    showBars: false,
    showNet: false,
    spacing: 3,
    nameMax: 0,
  }
}

/** 名字列宽度：按字符数估算（中文≈9pt，英文≈5.5pt），封顶 nameMax */
function nameWidth(s: CfsmServer, d: RowDensity): number {
  const per = d.rowFont === "caption2" ? 8 : 10
  return Math.min(d.nameMax, Math.max(20, s.name.length * per + 6))
}

/** 数值列固定宽度（右对齐）：百分比 3 字符 / 网速 5 字符 */
const PCT_W = 30
const NET_W = 46

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

/** 迷你进度条（Capsule 双层），宽度按百分比 */
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

/** 单台服务器行（总览模式） */
function OverviewRow({
  s,
  d,
}: {
  s: CfsmServer
  d: RowDensity
}): VirtualNode {
  const off = !s.online
  const right: VirtualNode = off ? (
    <Text font={d.rowFont} foregroundStyle="systemRed" lineLimit={1} minScaleFactor={0.8}>
      离线
    </Text>
  ) : d.showBars ? (
    <HStack spacing={d.spacing}>
      <MiniBar pct={s.cpu} width={d.barW} height={d.barH} color={usageColor(s.cpu)} />
      <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.9} frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.cpu)}
      </Text>
      <MiniBar pct={s.ramPct} width={d.barW} height={d.barH} color={usageColor(s.ramPct)} />
      <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.9} frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.ramPct)}
      </Text>
      {d.showNet ? (
        <Text font="caption2" monospacedDigit foregroundStyle="tertiaryLabel" frame={{ width: NET_W, alignment: "trailing" }}>
          ↓{fmtBytes(s.netIn)}
        </Text>
      ) : null}
    </HStack>
  ) : (
    <HStack spacing={d.spacing}>
      <Text font={d.rowFont} monospacedDigit foregroundStyle="secondaryLabel" frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.cpu)}
      </Text>
      <Text font={d.rowFont} monospacedDigit foregroundStyle="secondaryLabel" frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.ramPct)}
      </Text>
      {d.showNet ? (
        <Text font={d.rowFont} monospacedDigit foregroundStyle="tertiaryLabel" frame={{ width: NET_W, alignment: "trailing" }}>
          ↓{fmtBytes(s.netIn)}
        </Text>
      ) : null}
    </HStack>
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
      {d.showFlag && flagEmoji(s.region) ? (
        <Text font="caption2" opacity={0.8}>
          {flagEmoji(s.region)}
        </Text>
      ) : null}

      <Spacer minLength={2} />

      {right}
    </HStack>
  )
}

/** 单台行（三网模式）：● 名 区  CT 77  CU 127  CM 78 */
function PingRow({ s, d }: { s: CfsmServer; d: RowDensity }): VirtualNode {
  const off = !s.online
  const cell = (ms: number, loss: number, label: string) => {
    const bad = loss > 10 || ms >= 500
    return (
      <HStack spacing={2}>
        <Text font="caption2" opacity={0.6}>
          {label}
        </Text>
        <Text
          font={d.rowFont}
          monospacedDigit
          foregroundStyle={off ? "systemRed" : bad ? "systemOrange" : "secondaryLabel"}
          lineLimit={1}
          minScaleFactor={0.8}
          frame={{ width: 34, alignment: "trailing" }}
        >
          {off ? "—" : `${fmtMs(ms)}`}
        </Text>
      </HStack>
    )
  }
  return (
    <HStack spacing={d.spacing} opacity={off ? 0.55 : 1}>
      <Dot online={s.online} size={d.dot} />
      <Text font={d.rowFont} fontWeight="medium" lineLimit={1} minScaleFactor={0.8} foregroundStyle="label" frame={{ width: nameWidth(s, d), alignment: "leading" }}>
        {s.name}
      </Text>
      {flagEmoji(s.region) ? (
        <Text font="caption2" opacity={0.8}>
          {flagEmoji(s.region)}
        </Text>
      ) : null}
      <Spacer minLength={2} />
      {cell(s.pingCt, s.lossCt, "电")}
      <Spacer minLength={4} />
      {cell(s.pingCu, s.lossCu, "联")}
      <Spacer minLength={4} />
      {cell(s.pingCm, s.lossCm, "移")}
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
      <Text font={d.rowFont} fontWeight="medium" lineLimit={1} minScaleFactor={0.8} foregroundStyle="label" frame={{ width: nameWidth(s, d), alignment: "leading" }}>
        {s.name}
      </Text>
      <Spacer minLength={2} />
      {bar(s.cpu)}
      <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.9} frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.cpu)}
      </Text>
      <Spacer minLength={4} />
      {bar(s.ramPct)}
      <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.9} frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.ramPct)}
      </Text>
      <Spacer minLength={4} />
      {bar(s.diskPct)}
      <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.9} frame={{ width: PCT_W, alignment: "trailing" }}>
        {fmtPct(s.diskPct)}
      </Text>
    </HStack>
  )
}

/** 标题行：站点名 + 在线统计 + 全站吞吐（不同模式可定制右侧） */
function Header({
  snap,
  mode,
}: {
  snap: CfsmSnapshot
  mode: WidgetMode
}): VirtualNode {
  const right =
    mode === "overview" ? (
      <HStack spacing={4}>
        <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel">
          ↓{fmtBytes(snap.globalIn)}
        </Text>
        <Text font="caption2" monospacedDigit foregroundStyle="secondaryLabel" opacity={0.7}>
          ↑{fmtBytes(snap.globalOut)}
        </Text>
      </HStack>
    ) : mode === "ping" ? (
      <Text font="caption2" foregroundStyle="secondaryLabel">
        三网延迟
      </Text>
    ) : (
      <Text font="caption2" foregroundStyle="secondaryLabel">
        资源占用
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
      {right}
    </HStack>
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
        <Image
          systemName="arrow.clockwise"
          imageScale="small"
          widgetAccentable
        />
      </Button>
    </HStack>
  )
}

/** 首次使用/连接失败的错误视图 */
function ErrView(msg: string): VirtualNode {
  return (
    <VStack spacing={6} padding={12}>
      <Image
        systemName="wifi.exclamationmark"
        imageScale="medium"
        foregroundStyle="systemOrange"
      />
      <Text font="caption" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        {msg}
      </Text>
      <Text font="caption2" foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
        在 App 设置里填写面板地址
      </Text>
    </VStack>
  )
}// ---------------------------------------------------------------- 骨架

/** parameter → 模式（未知值一律按总览） */
function modeOf(param: string): WidgetMode {
  const p = String(param ?? "").trim().toLowerCase()
  if (p === "ping") return "ping"
  if (p === "resources" || p === "resource") return "resources"
  return "overview"
}

/** 每种尺寸最多渲染几行（在线优先，超出截断，底部提示） */
function rowCapacity(family: string, count: number): number {
  if (family === "systemLarge") return count <= 12 ? 11 : 15
  if (family === "systemMedium") return 5
  return 0
}

/** systemSmall：不做列表，给红绿灯摘要（在线 N/M + 离线点名） */
function SmallSummary({ snap }: { snap: CfsmSnapshot }): VirtualNode {
  const offlineNames = snap.servers.filter(s => !s.online).map(s => s.name).slice(0, 3)
  return (
    <VStack spacing={8} padding={12}>
      <Header snap={snap} mode="overview" />
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
        <VStack spacing={2}>
          <Text font="caption2" foregroundStyle="systemOrange" lineLimit={2} minScaleFactor={0.75}>
            离线：{offlineNames.join("、")}
          </Text>
        </VStack>
      ) : (
        <Text font="caption2" foregroundStyle="secondaryLabel">
          全部在线
        </Text>
      )}
      <Footer snap={snap} stale={false} />
    </VStack>
  )
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

  const R = mode === "ping" ? PingRow : mode === "resources" ? ResourceRow : OverviewRow

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