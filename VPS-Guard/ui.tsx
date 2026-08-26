/**
 * 主 App 界面的公共部件。
 *
 * 这里放「列表行」「灯」「迷你曲线」这类会被多处复用的小组件。
 * index.tsx 只管页面编排，不重复写样式。
 */

import {
  Capsule,
  Circle,
  HStack,
  Spacer,
  Text,
  VStack,
  ZStack,
  type VirtualNode,
} from "scripting"

import {
  type Host,
  type HostState,
  type Settings,
  statusColor,
  statusLabel,
  type StatusColor,
} from "./types"
import {
  fmtRtt,
  fmtUptime,
  relTimeShort,
  sparkPoints,
  stateHint,
} from "./format"

// ---------------------------------------------------------------- 状态灯

/**
 * 状态灯。外圈光晕让它在深色背景上更像「真的在发光」，
 * 这是廉价但有效的精致感来源。
 */
export function Lamp({
  status,
  size = 10,
  glow = true,
}: {
  status: HostState["status"]
  size?: number
  glow?: boolean
}): VirtualNode {
  const color = statusColor(status)
  return (
    <ZStack frame={{ width: size * 2, height: size * 2 }}>
      {glow ? (
        <Circle
          fill={color}
          opacity={0.22}
          frame={{ width: size * 2, height: size * 2 }}
        />
      ) : null}
      <Circle fill={color} frame={{ width: size, height: size }} />
    </ZStack>
  )
}

// ---------------------------------------------------------------- 迷你曲线

/**
 * 迷你延迟柱状图。
 *
 * 用 Capsule 拼柱子而不是画折线 —— Scripting 的 Chart 在小尺寸下留白太多，
 * 而柱子在 20pt 高度里依然清晰，并且失败点可以用红色柱子表达，信息量更大。
 */
export function Spark({
  state,
  points = 24,
  height = 22,
  barWidth = 3,
  gap = 2,
}: {
  state: HostState
  points?: number
  height?: number
  barWidth?: number
  gap?: number
}): VirtualNode {
  const data = sparkPoints(state.history, points)

  if (data.length === 0) {
    return (
      <Capsule
        fill="systemGray"
        opacity={0.18}
        frame={{ height: 3 }}
      />
    )
  }

  // 归一化基准：用成功点的最大值，失败点单独用满高红柱表示
  const oks = data.filter(v => v >= 0)
  const max = oks.length > 0 ? Math.max(...oks) : 1
  const base = Math.max(max, 1)

  return (
    <HStack spacing={gap} alignment="bottom" frame={{ height }}>
      {data.map((v, i) => {
        if (v < 0) {
          // 失败点：满高红柱，一眼能看到「这里断过」
          return (
            <Capsule
              key={`f${i}`}
              fill="systemRed"
              opacity={0.75}
              frame={{ width: barWidth, height }}
            />
          )
        }
        const h = Math.max(2, Math.round((v / base) * height))
        return (
          <Capsule
            key={`o${i}`}
            fill="systemGreen"
            opacity={0.55}
            frame={{ width: barWidth, height: h }}
          />
        )
      })}
    </HStack>
  )
}

// ---------------------------------------------------------------- 列表行

/** 主 App 列表里的一行。信息分三层：别名/状态 → 地址/归属地 → 曲线 */
export function HostRow({
  host,
  state,
  settings,
}: {
  host: Host
  state: HostState
  settings: Settings
}): VirtualNode {
  const color = statusColor(state.status)
  const dim = host.paused === true

  return (
    <VStack alignment="leading" spacing={5} opacity={dim ? 0.45 : 1}>
      {/* 第一层：灯 + 别名 + 延迟 */}
      <HStack spacing={8}>
        <Lamp status={host.paused === true ? "unknown" : state.status} size={9} />

        <VStack alignment="leading" spacing={1}>
          <Text font="body" fontWeight="semibold" lineLimit={1}>
            {host.alias}
          </Text>
          <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
            {host.paused === true ? "已暂停" : stateHint(state)}
          </Text>
        </VStack>

        <Spacer />

        <VStack alignment="trailing" spacing={1}>
          <Text
            font="footnote"
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={state.status === "offline" ? "systemRed" : color}
          >
            {state.status === "offline" ? statusLabel(state.status) : fmtRtt(state.rtt)}
          </Text>
          {settings.showRtt ? (
            <Text font="caption2" foregroundStyle="tertiaryLabel" monospacedDigit>
              {fmtUptime(state)}
            </Text>
          ) : null}
        </VStack>
      </HStack>

      {/* 第二层：地址 + 归属地 */}
      <HStack spacing={6}>
        <Text
          font="caption2"
          fontDesign="monospaced"
          foregroundStyle="secondaryLabel"
          lineLimit={1}
        >
          {host.address}
        </Text>
        {settings.showGeo && host.geo != null ? (
          <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
            {host.geo.flag} {host.geo.country}
            {host.geo.city ? ` · ${host.geo.city}` : ""}
          </Text>
        ) : null}
      </HStack>

      {/* 第三层：迷你曲线 */}
      {settings.showSparkline ? <Spark state={state} points={28} height={18} /> : null}
    </VStack>
  )
}

// ---------------------------------------------------------------- 摘要卡

/** 顶部摘要：一行数字 + 一条比例条 */
export function SummaryCard({
  online,
  offline,
  degraded,
  total,
  updatedAt,
  networkOk,
}: {
  online: number
  offline: number
  degraded: number
  total: number
  updatedAt: number
  networkOk: boolean
}): VirtualNode {
  const ratio = total > 0 ? online / total : 0

  return (
    <VStack alignment="leading" spacing={10}>
      <HStack spacing={14}>
        <VStack alignment="leading" spacing={2}>
          <HStack alignment="bottom" spacing={2}>
            <Text font="largeTitle" fontWeight="bold" monospacedDigit>
              {online}
            </Text>
            <Text
              font="title3"
              fontWeight="regular"
              foregroundStyle="secondaryLabel"
              monospacedDigit
              padding={{ bottom: 3 }}
            >
              {`/ ${total}`}
            </Text>
          </HStack>
          <Text font="caption" foregroundStyle="secondaryLabel">
            在线
          </Text>
        </VStack>

        <Spacer />

        <VStack alignment="trailing" spacing={3}>
          {!networkOk ? (
            <Text font="caption" fontWeight="semibold" foregroundStyle="systemOrange">
              本机无网络
            </Text>
          ) : offline > 0 ? (
            <Text font="caption" fontWeight="semibold" foregroundStyle="systemRed">
              {offline} 台离线
            </Text>
          ) : degraded > 0 ? (
            <Text font="caption" fontWeight="semibold" foregroundStyle="systemOrange">
              {degraded} 台不稳定
            </Text>
          ) : (
            <Text font="caption" fontWeight="semibold" foregroundStyle="systemGreen">
              全部正常
            </Text>
          )}
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            {updatedAt > 0 ? `${relTimeShort(updatedAt)}检测` : "尚未检测"}
          </Text>
        </VStack>
      </HStack>

      {/* 比例条：绿/黄/红按台数分段，比单个百分比更直观 */}
      <ZStack alignment="leading" frame={{ height: 6 }}>
        <Capsule fill="systemGray" opacity={0.2} frame={{ height: 6 }} />
        <HStack spacing={2} frame={{ height: 6 }}>
          {Array.from({ length: total }).map((_, i) => {
            const fill =
              i < online ? "systemGreen" : i < online + degraded ? "systemOrange" : "systemRed"
            return (
              <Capsule
                key={`seg${i}`}
                fill={fill}
                frame={{ maxWidth: "infinity", height: 6 }}
              />
            )
          })}
        </HStack>
      </ZStack>

      {total === 0 ? (
        <Text font="caption2" foregroundStyle="tertiaryLabel">
          还没有添加服务器
        </Text>
      ) : null}

      {/* ratio 参与渲染，避免未使用变量；同时给出一句可读的总结 */}
      {total > 0 ? (
        <Text font="caption2" foregroundStyle="tertiaryLabel" monospacedDigit>
          {`可用 ${Math.round(ratio * 100)}%`}
        </Text>
      ) : null}
    </VStack>
  )
}

// ---------------------------------------------------------------- 细节行

/** 详情页里的「标签 : 值」一行 */
export function DetailRow({
  label,
  value,
  mono = false,
  color,
}: {
  label: string
  value: string
  mono?: boolean
  color?: StatusColor
}): VirtualNode {
  return (
    <HStack>
      <Text font="footnote" foregroundStyle="secondaryLabel">
        {label}
      </Text>
      <Spacer />
      <Text
        font="footnote"
        fontDesign={mono ? "monospaced" : "default"}
        foregroundStyle={color ?? "label"}
        lineLimit={1}
      >
        {value}
      </Text>
    </HStack>
  )
}
