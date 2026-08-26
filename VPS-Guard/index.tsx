/**
 * 主 App 界面 —— 所有配置都在这里。
 *
 * 结构：
 *   HostEditor    添加 / 编辑一台机器（别名、地址、探测方式、归属地）
 *   HostDetail    单机详情：大灯、延迟、可用率、历史条、归属地
 *   SettingsPage  探测参数与显示开关，全部可调
 *   MainPage      主列表：摘要卡 + 主机行（下拉刷新、滑动操作、点进详情）
 *
 * 关键约定：任何数据落盘之后都调 Widget.reloadAll()，让主屏立刻跟上。
 */

import {
  Button,
  ContentUnavailableView,
  Dialog,
  HStack,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Picker,
  Script,
  Section,
  Spacer,
  Stepper,
  Text,
  TextField,
  Toggle,
  VStack,
  Widget,
  useEffect,
  useState,
  type VirtualNode,
} from "scripting"

import {
  DEFAULT_PROBE,
  DEFAULT_SETTINGS,
  statusColor,
  statusLabel,
  type Host,
  type ProbeType,
  type Settings,
  type Snapshot,
} from "./types"

import {
  loadHosts,
  loadSettings,
  loadSnapshot,
  pruneSnapshot,
  saveHosts,
  saveSettings,
  saveSnapshot,
  sortHosts,
  stateOf,
} from "./store"

import {
  detectIcmpSupport,
  isIPLiteral,
  lookupGeo,
  mergeResult,
  probeHost,
  resolveDomain,
  runRound,
} from "./probe"

import {
  avgRtt,
  clockTime,
  fmtRtt,
  fmtUptime,
  jitter,
  relTime,
  stateHint,
  tally,
} from "./format"

import { DetailRow, HostRow, Lamp, Spark, SummaryCard } from "./ui"

// ---------------------------------------------------------------- 工具

/** 简易 id：时间戳 + 随机尾巴，够我们这个规模用 */
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 从文本里取一个整数，非法时回退到默认值 */
function toInt(s: string, fallback: number, min: number, max: number): number {
  const n = parseInt(s, 10)
  if (isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const PROBE_LABEL: Record<ProbeType, string> = {
  tcp: "TCP 端口",
  http: "HTTP(S)",
  icmp: "ICMP ping",
}

// ---------------------------------------------------------------- 主机编辑

/**
 * 添加 / 编辑一台机器。
 *
 * 「保存前先试一下」是这里的核心体验：填完直接点测试，当场知道配置对不对，
 * 而不是存下去等小组件红了才发现端口写错。
 */
function HostEditor({
  existing,
  resetKey,
  settings,
  onDone,
  onCancel,
}: {
  existing: Host | null
  /** 每次打开「新增」都换一个新值：sheet 关闭后组件不卸载，
   *  useState 初始值只在首次挂载生效，必须靠它驱动表单重置 */
  resetKey: string
  settings: Settings
  onDone: (host: Host, opts?: { addAnother?: boolean }) => void
  onCancel: () => void
}): VirtualNode {
  // 程序化关闭弹层：不依赖父层 sheet 状态回传（保存后不关弹窗的根因）
  const dismiss = Navigation.useDismiss()
  const [hostId, setHostId] = useState<string>(existing?.id ?? resetKey)
  const [alias, setAlias] = useState(existing?.alias ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [probeType, setProbeType] = useState<ProbeType>(
    existing?.probe.type ?? DEFAULT_PROBE.type,
  )
  const [portText, setPortText] = useState(
    String(existing?.probe.port ?? DEFAULT_PROBE.port),
  )
  const [pathText, setPathText] = useState(existing?.probe.path ?? "/")
  const [https, setHttps] = useState(existing?.probe.https === true)
  const [geo, setGeo] = useState(existing?.geo)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<boolean | null>(null)

  // resetKey 变化 = 新的一次添加/编辑会话，整张表单回到初始值。
  // 没有这个的话，第二次打开「添加」会残留上一台的表单和 id，
  // 保存就变成改上一台（真机已踩）。
  useEffect(() => {
    setHostId(existing?.id ?? resetKey)
    setAlias(existing?.alias ?? "")
    setAddress(existing?.address ?? "")
    setProbeType(existing?.probe.type ?? DEFAULT_PROBE.type)
    setPortText(String(existing?.probe.port ?? DEFAULT_PROBE.port))
    setPathText(existing?.probe.path ?? "/")
    setHttps(existing?.probe.https === true)
    setGeo(existing?.geo)
    setTesting(false)
    setTestResult(null)
    setTestOk(null)
  }, [resetKey])

  const addressTrimmed = address.trim()
  const canSave = addressTrimmed.length > 0

  /** 组装当前表单对应的 Host 对象 */
  function build(): Host {
    const port = toInt(
      portText,
      probeType === "http" ? (https ? 443 : 80) : 22,
      1,
      65535,
    )
    return {
      id: hostId,
      alias: alias.trim() || addressTrimmed,
      address: addressTrimmed,
      ip: isIPLiteral(addressTrimmed) ? addressTrimmed : existing?.ip ?? addressTrimmed,
      probe: {
        type: probeType,
        port,
        path: probeType === "http" ? pathText.trim() || "/" : undefined,
        https: probeType === "http" ? https : undefined,
      },
      geo,
      order: existing?.order ?? Number.MAX_SAFE_INTEGER,
      paused: existing?.paused,
      createdAt: existing?.createdAt ?? Date.now(),
    }
  }

  /** 查归属地。域名先解析成 IP —— 查域名本身没意义 */
  async function fetchGeo() {
    if (addressTrimmed.length === 0) return
    setTesting(true)
    setTestResult("正在查询归属地…")
    setTestOk(null)
    try {
      let ip = addressTrimmed
      if (!isIPLiteral(addressTrimmed)) {
        const r = await resolveDomain(addressTrimmed, settings.timeoutSec)
        if (r.ip == null) {
          setTestResult("域名解析失败，检查一下地址")
          setTestOk(false)
          return
        }
        ip = r.ip
      }
      const g = await lookupGeo(ip)
      if (g.geo != null) {
        setGeo(g.geo)
        setTestResult(`${g.geo.flag} ${g.geo.country} ${g.geo.city}・${g.geo.isp}`)
        setTestOk(true)
      } else {
        setTestResult(g.error ?? "归属地查询失败")
        setTestOk(false)
      }
    } finally {
      setTesting(false)
    }
  }

  /** 用当前表单真探一次，当场验证配置 */
  async function testProbe() {
    if (addressTrimmed.length === 0) return
    setTesting(true)
    setTestResult("正在探测…")
    setTestOk(null)
    try {
      const icmpOk = await detectIcmpSupport()
      const result = await probeHost(build(), settings, icmpOk)
      const ok = result.outcome === "online"
      setTestOk(ok)
      const rtt = result.rtt >= 0 ? `・${fmtRtt(result.rtt)}` : ""
      setTestResult(`${ok ? "通" : "不通"}：${result.detail}${rtt}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={existing != null ? "编辑服务器" : "添加服务器"}
        navigationBarTitleDisplayMode="inline"
        listStyle="insetGrouped"
        toolbar={{
          cancellationAction: [
            <Button
              key="c"
              title="取消"
              action={() => {
                onCancel()
                dismiss()
              }}
            />,
          ],
          confirmationAction: [
            <Button
              key="s"
              title="保存"
              disabled={!canSave}
              action={() => {
                // 先关闭弹层：即使后续落盘出错，界面状态也正确
                dismiss()
                try {
                  onDone(build())
                } catch (e) {
                  Dialog.alert({ title: "保存失败", message: String(e) })
                }
              }}
            />,
          ],
        }}
      >
        <Section
          header={<Text>基本信息</Text>}
          footer={
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              地址支持 IPv4、IPv6 和域名。别名留空就用地址代替。
            </Text>
          }
        >
          <TextField
            title="别名"
            value={alias}
            onChanged={setAlias}
            prompt="东京小鸡"
          />
          <TextField
            title="地址"
            value={address}
            onChanged={setAddress}
            prompt="1.2.3.4 或 vps.example.com"
          />
        </Section>

        <Section
          header={<Text>探测方式</Text>}
          footer={
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              {probeType === "tcp"
                ? "TCP 最可靠：端口有任何回应（包括拒绝连接）都说明机器活着，只有完全超时才判离线。SSH 的 22 端口是个好选择。"
                : probeType === "http"
                  ? "HTTP 适合跑着网站的机器，能顺带确认 Web 服务本身是否正常。"
                  : "ICMP 依赖系统是否提供 ping，且很多机房默认丢 ICMP 包——不通不一定代表机器挂了。不可用时会自动降级成 TCP。"}
            </Text>
          }
        >
          <Picker
            title="方式"
            value={probeType}
            onChanged={v => {
              const next = v as ProbeType
              setProbeType(next)
              // 切换方式时把端口调成该方式的常用值，省得手动改
              if (next === "http") setPortText(https ? "443" : "80")
              else if (next === "tcp") setPortText("22")
            }}
            pickerStyle="segmented"
          >
            <Text tag="tcp">TCP</Text>
            <Text tag="http">HTTP</Text>
            <Text tag="icmp">ICMP</Text>
          </Picker>

          {probeType !== "icmp" ? (
            <TextField
              title="端口"
              value={portText}
              onChanged={setPortText}
              prompt="22"
              keyboardType="numberPad"
            />
          ) : null}

          {probeType === "http" ? (
            <VStack>
              <Toggle
                title="使用 HTTPS"
                value={https}
                onChanged={v => {
                  setHttps(v)
                  setPortText(v ? "443" : "80")
                }}
              />
              <TextField
                title="路径"
                value={pathText}
                onChanged={setPathText}
                prompt="/"
              />
            </VStack>
          ) : null}
        </Section>

        <Section header={<Text>归属地</Text>}>
          {geo != null ? (
            <VStack alignment="leading" spacing={3}>
              <HStack spacing={6}>
                <Text>{geo.flag}</Text>
                <Text fontWeight="medium">
                  {`${geo.country} ${geo.city}`.trim()}
                </Text>
              </HStack>
              <Text font="caption" foregroundStyle="secondaryLabel">
                {[geo.isp, geo.asn].filter(x => x.length > 0).join("・")}
              </Text>
            </VStack>
          ) : (
            <Text foregroundStyle="secondaryLabel">还没查询</Text>
          )}
          <Button
            title={geo != null ? "重新查询归属地" : "查询归属地"}
            systemImage="globe.asia.australia"
            disabled={!canSave || testing}
            action={fetchGeo}
          />
        </Section>

        <Section>
          <Button
            title="保存并继续添加下一台"
            systemImage="plus.square.on.plus.square"
            disabled={!canSave || testing}
            action={() => onDone(build(), { addAnother: true })}
          />
        </Section>

        <Section
          header={<Text>保存前先试一下</Text>}
          footer={
            testResult != null ? (
              <Text
                font="caption"
                foregroundStyle={
                  testOk === true
                    ? "systemGreen"
                    : testOk === false
                      ? "systemRed"
                      : "secondaryLabel"
                }
              >
                {testResult}
              </Text>
            ) : (
              <Text font="caption2" foregroundStyle="tertiaryLabel">
                当场验证配置对不对，比存下去等红灯靠谱。
              </Text>
            )
          }
        >
          <Button
            title={testing ? "正在测试…" : "测试这台机器"}
            systemImage="bolt.horizontal.circle"
            disabled={!canSave || testing}
            action={testProbe}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

// ---------------------------------------------------------------- 单机详情

/**
 * 单机详情页。
 *
 * 这里是「偶尔看一眼」之外的深挖入口：延迟、可用率、抖动、历史条、归属地，
 * 以及一个立刻重探的按钮。
 */
function HostDetail({
  host,
  settings,
  onSaveHost,
  onDelete,
}: {
  host: Host
  settings: Settings
  onSaveHost: (host: Host) => void
  onDelete: () => void
}): VirtualNode {
  const dismiss = Navigation.useDismiss()
  const [snap, setSnap] = useState<Snapshot>(() => loadSnapshot())
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const state = stateOf(snap, host.id)
  const color = statusColor(state.status)
  const avg = avgRtt(state)
  const jit = jitter(state)

  /** 只探这一台，结果并回全局快照 */
  async function probeThis() {
    if (busy) return
    setBusy(true)
    try {
      const icmpOk = await detectIcmpSupport()
      const result = await probeHost(host, settings, icmpOk)
      const current = loadSnapshot()
      const merged = mergeResult(stateOf(current, host.id), result, settings)
      const next: Snapshot = {
        ...current,
        updatedAt: Date.now(),
        states: { ...current.states, [host.id]: merged },
      }
      saveSnapshot(next)
      setSnap(next)
      Widget.reloadAll()
    } finally {
      setBusy(false)
    }
  }

  return (
    <List
      navigationTitle={host.alias}
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGrouped"
      toolbar={{
        topBarTrailing: [
          <Button
            key="edit"
            title="编辑"
            action={() => setEditOpen(true)}
          />,
        ],
      }}
      sheet={{
        isPresented: editOpen,
        onChanged: setEditOpen,
        content: (
          <HostEditor
            existing={host}
            resetKey={host.id}
            settings={settings}
            onDone={next => {
              onSaveHost(next)
              setEditOpen(false)
            }}
            onCancel={() => setEditOpen(false)}
          />
        ),
      }}
    >
      {/* 状态大卡：进来第一眼就该看明白 */}
      <Section>
        <VStack alignment="leading" spacing={10} padding={{ vertical: 6 }}>
          <HStack spacing={12}>
            <Lamp status={state.status} size={18} />
            <VStack alignment="leading" spacing={2}>
              <Text font="title2" fontWeight="bold" foregroundStyle={color}>
                {statusLabel(state.status)}
              </Text>
              <Text font="caption" foregroundStyle="secondaryLabel">
                {stateHint(state)}
              </Text>
            </VStack>
            <Spacer />
            {state.rtt >= 0 ? (
              <VStack alignment="trailing" spacing={0}>
                <Text font="title2" fontWeight="semibold" monospacedDigit>
                  {String(state.rtt)}
                </Text>
                <Text font="caption2" foregroundStyle="tertiaryLabel">
                  ms
                </Text>
              </VStack>
            ) : null}
          </HStack>

          {settings.showSparkline && state.history.length > 0 ? (
            <Spark state={state} points={40} height={34} barWidth={4} gap={2} />
          ) : null}
        </VStack>
      </Section>

      <Section header={<Text>统计</Text>}>
        <DetailRow label="可用率" value={fmtUptime(state)} mono />
        <DetailRow
          label="平均延迟"
          value={avg != null ? `${avg} ms` : "—"}
          mono
        />
        <DetailRow
          label="抖动"
          value={jit != null ? `±${jit} ms` : "—"}
          mono
        />
        <DetailRow
          label="采样点"
          value={`${state.history.length} / ${settings.historyPoints}`}
          mono
        />
      </Section>

      <Section header={<Text>最近一次探测</Text>}>
        <DetailRow label="结果" value={state.detail} color={color} />
        <DetailRow
          label="时间"
          value={state.lastProbeAt > 0 ? clockTime(state.lastProbeAt) : "—"}
          mono
        />
        <DetailRow
          label="尝试次数"
          value={state.attempts > 0 ? String(state.attempts) : "—"}
          mono
        />
        {state.nextProbeAt > 0 ? (
          <DetailRow
            label="退避至"
            value={clockTime(state.nextProbeAt)}
            mono
            color="systemOrange"
          />
        ) : null}
        {state.lastOnlineAt > 0 ? (
          <DetailRow label="上次在线" value={relTime(state.lastOnlineAt)} />
        ) : null}
      </Section>

      <Section header={<Text>配置</Text>}>
        <DetailRow label="地址" value={host.address} mono />
        {host.ip !== host.address ? (
          <DetailRow label="解析到" value={host.ip} mono />
        ) : null}
        <DetailRow label="探测方式" value={PROBE_LABEL[host.probe.type]} />
        {host.probe.type !== "icmp" ? (
          <DetailRow label="端口" value={String(host.probe.port)} mono />
        ) : null}
        {host.geo != null ? (
          <DetailRow
            label="归属地"
            value={`${host.geo.flag} ${host.geo.country} ${host.geo.city}`.trim()}
          />
        ) : null}
        {host.geo != null && host.geo.isp.length > 0 ? (
          <DetailRow label="运营商" value={host.geo.isp} />
        ) : null}
      </Section>

      <Section>
        <Button
          title={busy ? "正在探测…" : "立即探测这台"}
          systemImage="bolt.horizontal.circle"
          disabled={busy}
          action={probeThis}
        />
        <Button
          title={host.paused === true ? "恢复探测" : "暂停探测"}
          systemImage={host.paused === true ? "play.circle" : "pause.circle"}
          action={() => onSaveHost({ ...host, paused: !(host.paused === true) })}
        />
        <Button
          title="删除这台"
          systemImage="trash"
          role="destructive"
          action={async () => {
            const yes = await Dialog.confirm({
              title: "删除服务器",
              message: `确定删除「${host.alias}」吗？历史记录会一起清掉。`,
              cancelLabel: "取消",
              confirmLabel: "删除",
            })
            if (yes) {
              onDelete()
              dismiss()
            }
          }}
        />
      </Section>
    </List>
  )
}

// ---------------------------------------------------------------- 设置

/** 参数全部可调。默认值都是我按「偶尔看一眼」这个用法挑的，不改也能用。 */
function SettingsPage({
  settings,
  onSave,
}: {
  settings: Settings
  onSave: (s: Settings) => void
}): VirtualNode {
  const [s, setS] = useState<Settings>(settings)

  /** 改一个字段就立刻落盘 —— 设置页没有「保存」按钮，改完即生效 */
  function patch(p: Partial<Settings>) {
    const next = { ...s, ...p }
    setS(next)
    onSave(next)
  }

  return (
    <List
      navigationTitle="设置"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGrouped"
    >
      <Section
        header={<Text>探测判定</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            超时是离线判定的门槛：探测耗到这个时间还没回应才算不通。重试次数是「一轮里失败后再试几下」，连续失败轮数是「几轮都不通才标红」——中间状态显示为黄灯。
          </Text>
        }
      >
        <Stepper
          title={`超时 ${s.timeoutSec} 秒`}
          onIncrement={() => patch({ timeoutSec: Math.min(20, s.timeoutSec + 1) })}
          onDecrement={() => patch({ timeoutSec: Math.max(2, s.timeoutSec - 1) })}
        />
        <Stepper
          title={`失败后重试 ${s.retries} 次`}
          onIncrement={() => patch({ retries: Math.min(5, s.retries + 1) })}
          onDecrement={() => patch({ retries: Math.max(0, s.retries - 1) })}
        />
        <Stepper
          title={`连续 ${s.failThreshold} 轮不通才标离线`}
          onIncrement={() => patch({ failThreshold: Math.min(5, s.failThreshold + 1) })}
          onDecrement={() => patch({ failThreshold: Math.max(1, s.failThreshold - 1) })}
        />
        <Stepper
          title={`延迟超过 ${s.degradedMs}ms 算慢`}
          onIncrement={() => patch({ degradedMs: Math.min(3000, s.degradedMs + 100) })}
          onDecrement={() => patch({ degradedMs: Math.max(100, s.degradedMs - 100) })}
        />
      </Section>

      <Section
        header={<Text>退避</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            确认离线的机器不必反复敲门。每多失败一轮，下次探测就往后推一倍，最多推到上限。省电，也不打扰已经躺平的机器。
          </Text>
        }
      >
        <Stepper
          title={`起始 ${s.backoffBaseMin} 分钟`}
          onIncrement={() => patch({ backoffBaseMin: Math.min(60, s.backoffBaseMin + 1) })}
          onDecrement={() => patch({ backoffBaseMin: Math.max(1, s.backoffBaseMin - 1) })}
        />
        <Stepper
          title={`上限 ${s.backoffMaxMin} 分钟`}
          onIncrement={() => patch({ backoffMaxMin: Math.min(720, s.backoffMaxMin + 15) })}
          onDecrement={() => patch({ backoffMaxMin: Math.max(5, s.backoffMaxMin - 15) })}
        />
      </Section>

      <Section header={<Text>显示</Text>}>
        <Toggle
          title="显示延迟"
          value={s.showRtt}
          onChanged={v => patch({ showRtt: v })}
        />
        <Toggle
          title="显示归属地"
          value={s.showGeo}
          onChanged={v => patch({ showGeo: v })}
        />
        <Toggle
          title="显示延迟迷你图"
          value={s.showSparkline}
          onChanged={v => patch({ showSparkline: v })}
        />
      </Section>

      <Section
        header={<Text>历史</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            每台机器保留的采样点数量，用来算可用率和画迷你图。
          </Text>
        }
      >
        <Stepper
          title={`保留 ${s.historyPoints} 个采样点`}
          onIncrement={() => patch({ historyPoints: Math.min(1000, s.historyPoints + 48) })}
          onDecrement={() => patch({ historyPoints: Math.max(24, s.historyPoints - 48) })}
        />
      </Section>

      <Section
        header={<Text>网络哨兵</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            每轮探测前先访问这个地址确认手机自己有网。否则地铁里没信号时，所有机器都会被冤枉成离线。
          </Text>
        }
      >
        <TextField
          title="哨兵地址"
          value={s.sentinelUrl}
          onChanged={v => patch({ sentinelUrl: v })}
          prompt={DEFAULT_SETTINGS.sentinelUrl}
        />
      </Section>

      <Section>
        <Button
          title="恢复默认设置"
          systemImage="arrow.counterclockwise"
          role="destructive"
          action={async () => {
            const yes = await Dialog.confirm({
              title: "恢复默认设置",
              message: "所有参数会回到初始值，服务器列表和历史不受影响。",
              cancelLabel: "取消",
              confirmLabel: "恢复",
            })
            if (yes) {
              setS(DEFAULT_SETTINGS)
              onSave(DEFAULT_SETTINGS)
            }
          }}
        />
      </Section>
    </List>
  )
}

// ---------------------------------------------------------------- 批量添加

/** 导出格式：别名,地址（别名与地址相同时省略别名），与导入格式一致 */
function serializeHosts(hosts: Host[]): string {
  return hosts
    .map(h => (h.alias === h.address ? h.address : `${h.alias},${h.address}`))
    .join("\n")
}

/**
 * 批量粘贴添加 + 文本备份。
 * 一行一台：`别名,地址` 或只写地址；与现有列表地址重复的行跳过。
 * 备份用同一格式 —— 复制出去存好，丢了列表就粘回来。
 */
function BulkAddPage({
  onImport,
}: {
  onImport: (hosts: Host[]) => void
}): VirtualNode {
  const [text, setText] = useState("")
  const [result, setResult] = useState<string | null>(null)
  const [exportText, setExportText] = useState(() => serializeHosts(loadHosts()))

  const lineCount = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0).length

  function parse(): { hosts: Host[]; skipped: number } {
    const known = new Set(
      loadHosts().map(x => x.address.trim().toLowerCase()),
    )
    const hosts: Host[] = []
    let skipped = 0
    for (const raw of text.split("\n")) {
      const line = raw.trim()
      if (line.length === 0) continue
      const sepIdx = line.search(/[，,]/)
      let alias = ""
      let addr = line
      if (sepIdx > 0) {
        alias = line.slice(0, sepIdx).trim()
        addr = line.slice(sepIdx + 1).trim()
      }
      if (addr.length === 0 || known.has(addr.toLowerCase())) {
        skipped++
        continue
      }
      known.add(addr.toLowerCase())
      hosts.push({
        id: newId(),
        alias: alias.length > 0 ? alias : addr,
        address: addr,
        ip: addr,
        probe: { ...DEFAULT_PROBE },
        order: Number.MAX_SAFE_INTEGER,
        createdAt: Date.now(),
      })
    }
    return { hosts, skipped }
  }

  return (
    <List
      navigationTitle="批量添加"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGrouped"
    >
      <Section
        header={<Text>每行一台，粘贴进来</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            格式：别名,地址（别名可省略）。支持 IPv4、IPv6、域名。和现有列表地址重复的行会自动跳过。归属地之后在单台详情里查。
          </Text>
        }
      >
        <TextField
          title="服务器列表"
          value={text}
          onChanged={setText}
          prompt={"东京,1.2.3.4\nvps.example.com"}
          axis="vertical"
          lineLimit={{ min: 6, max: 14 }}
        />
        <Button
          title={lineCount > 0 ? `导入 ${lineCount} 台` : "导入"}
          systemImage="square.and.arrow.down"
          disabled={lineCount === 0}
          action={() => {
            const { hosts, skipped } = parse()
            if (hosts.length === 0) {
              setResult("没有可导入的新地址")
              return
            }
            onImport(hosts)
            setResult(
              `已添加 ${hosts.length} 台` +
                (skipped > 0 ? `，跳过 ${skipped} 行（重复或格式不对）` : ""),
            )
            setText("")
          }}
        />
        {result != null ? (
          <Text font="footnote" foregroundStyle="systemGreen">
            {result}
          </Text>
        ) : null}
      </Section>

      <Section
        header={<Text>备份 / 恢复</Text>}
        footer={
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            删除脚本重装会清掉本地数据 —— 先把这份文本复制到备忘录，需要时整段粘回上面的导入框即可恢复。
          </Text>
        }
      >
        <Button
          title="从当前列表重新生成"
          systemImage="arrow.clockwise"
          action={() => setExportText(serializeHosts(loadHosts()))}
        />
        <TextField
          title="备份文本"
          value={exportText}
          onChanged={setExportText}
          axis="vertical"
          lineLimit={{ min: 4, max: 10 }}
        />
      </Section>
    </List>
  )
}

// ---------------------------------------------------------------- 主列表

function MainPage(): VirtualNode {
  const [hosts, setHosts] = useState<Host[]>(() => loadHosts())
  const [snap, setSnap] = useState<Snapshot>(() => loadSnapshot())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // 每次「新增」换一个 resetKey，驱动编辑器表单重置
  const [draftId, setDraftId] = useState(() => newId())

  const t = tally(hosts.map(h => stateOf(snap, h.id).status))
  const ordered = sortHosts(hosts, snap, settings.sortMode)

  /** 落盘 + 通知主屏。任何改动都走这里，保证小组件不会看到过期数据 */
  function persistHosts(next: Host[]) {
    saveHosts(next)
    const pruned = pruneSnapshot(loadSnapshot(), next)
    saveSnapshot(pruned)
    setHosts(next)
    setSnap(pruned)
    try {
      Widget.reloadAll()
    } catch {
      // 刷新小组件失败不该影响保存主流程
    }
  }

  /** 新增或更新一台。数据源用 Storage 里的最新值，绕开闭包陈旧问题 */
  function upsertHost(host: Host) {
    const cur = loadHosts()
    const exists = cur.some(x => x.id === host.id)
    persistHosts(
      exists ? cur.map(x => (x.id === host.id ? host : x)) : [...cur, host],
    )
  }

  function persistSettings(next: Settings) {
    setSettings(next)
    saveSettings(next)
    Widget.reloadAll()
  }

  /** 探一轮。force = 忽略退避，用户主动要求的就该立刻执行 */
  async function refresh(force: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const fresh = loadHosts()
      const next = await runRound(fresh, loadSnapshot(), settings, {
        force,
        // App 里在前台，可以给足预算；只在小组件里才需要抢时间
        budgetMs: 120_000,
        onEach: (id, st) => {
          // 逐台刷新，让用户看到进度而不是干等
          setSnap(prev => ({
            ...prev,
            states: { ...prev.states, [id]: st },
          }))
        },
      })
      saveSnapshot(next)
      setSnap(next)
      Widget.reloadAll()
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="VPS 红绿灯"
        navigationBarTitleDisplayMode="large"
        listStyle="insetGrouped"
        refreshable={async () => {
          await refresh(true)
        }}
        toolbar={{
          topBarTrailing: [
            <Button
              key="add"
              title="添加"
              systemImage="plus"
              action={() => {
                setDraftId(newId())
                setAddOpen(true)
              }}
            />,
          ],
        }}
        sheet={{
          isPresented: addOpen,
          onChanged: setAddOpen,
          content: (
            <HostEditor
              settings={settings}
              existing={null}
              resetKey={draftId}
              onDone={(host, opts) => {
                upsertHost(host)
                if (opts?.addAnother) {
                  // 留在弹层里，换一个新草稿 id → 表单自动重置
                  setDraftId(newId())
                } else {
                  setAddOpen(false)
                }
              }}
              onCancel={() => setAddOpen(false)}
            />
          ),
        }}
      >
        {hosts.length === 0 ? (
          <ContentUnavailableView
            title="还没有服务器"
            systemImage="server.rack"
            description={
              <Text>点右上角的 + 添加第一台，别名和归属地都会自动准备好。</Text>
            }
          />
        ) : (
          <Section
            header={
              <SummaryCard
                online={t.online}
                offline={t.offline}
                degraded={t.degraded}
                total={t.total}
                updatedAt={snap.updatedAt}
                networkOk={snap.networkOk}
              />
            }
            footer={
              <Text font="caption2" foregroundStyle="tertiaryLabel">
                下拉刷新可立即探测全部。左滑单台可暂停或删除。
              </Text>
            }
          >
            {ordered.map(host => (
              <NavigationLink
                key={host.id}
                destination={
                  <HostDetail
                    host={host}
                    settings={settings}
                    onSaveHost={next => upsertHost(next)}
                    onDelete={() =>
                      persistHosts(loadHosts().filter(x => x.id !== host.id))
                    }
                  />
                }
                trailingSwipeActions={{
                  allowsFullSwipe: false,
                  actions: [
                    <Button
                      key="del"
                      title="删除"
                      systemImage="trash"
                      role="destructive"
                      action={() =>
                        persistHosts(loadHosts().filter(x => x.id !== host.id))
                      }
                    />,
                    <Button
                      key="pause"
                      title={host.paused === true ? "恢复" : "暂停"}
                      systemImage={host.paused === true ? "play" : "pause"}
                      action={() =>
                        persistHosts(
                          loadHosts().map(x =>
                            x.id === host.id ? { ...x, paused: !(x.paused === true) } : x,
                          ),
                        )
                      }
                    />,
                  ],
                }}
              >
                <HostRow
                  host={host}
                  state={stateOf(snap, host.id)}
                  settings={settings}
                />
              </NavigationLink>
            ))}
          </Section>
        )}

        <Section
          footer={
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              排序方式也可以在「设置」里改。
            </Text>
          }
        >
          <Button
            title={busy ? "正在探测…" : "立即全部探测"}
            systemImage="bolt.horizontal.circle"
            action={() => refresh(true)}
          />
          <NavigationLink
            title="设置"
            destination={
              <SettingsPage settings={settings} onSave={persistSettings} />
            }
          />
          <NavigationLink
            title="批量添加 / 备份"
            destination={<BulkAddPage onImport={hosts => persistHosts([...loadHosts(), ...hosts])} />}
          />
          <NavigationLink
            title="排序方式"
            destination={
              <SettingsPage settings={settings} onSave={persistSettings} />
            }
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

// ---------------------------------------------------------------- 入口

async function run() {
  // 首次运行时顺手确认一下 ios_system 到底有没有 ping，
  // 结果缓存起来，后面 ICMP 选项是否可用就看它。
  detectIcmpSupport().catch(() => {})

  await Navigation.present({ element: <MainPage /> })
  Script.exit()
}

run()
