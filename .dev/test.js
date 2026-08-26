/**
 * 纯逻辑单元测试（node 直接跑编译产物）。
 *
 * 只测不依赖 iOS 宿主的部分：状态机、退避、格式化、排序、环形历史。
 * 网络探测 / Storage / UI 渲染必须在真机上验证，这里 mock 掉。
 */

// ---- mock iOS 宿主全局 ----
const _store = {}
global.Storage = {
  get: k => (k in _store ? JSON.parse(_store[k]) : null),
  set: (k, v) => { _store[k] = JSON.stringify(v); return true },
  remove: k => { delete _store[k] },
  contains: k => k in _store,
}

const T = require("./build/VPS-Guard/types.js")
const S = require("./build/VPS-Guard/store.js")
const P = require("./build/VPS-Guard/probe.js")
const F = require("./build/VPS-Guard/format.js")

let pass = 0, fail = 0
const fails = []

function ok(name, cond, extra) {
  if (cond) { pass++ }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")) }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

const SET = { ...T.DEFAULT_SETTINGS }

function result(over, outcome = "offline") {
  const now = Date.now()
  return { hostId: "h1", outcome, rtt: -1, detail: "测试", attempts: 3,
           startedAt: now - 100, finishedAt: now, ...over }
}

// ================================================ 1. 摇摆抑制
{
  // 第一次失败：不该直接红，应该先黄（degraded）
  let st = T.emptyState()
  st = P.mergeResult(st, result({}), SET)
  eq("首次失败→degraded（不闪红）", st.status, "degraded")
  eq("  连续失败计数=1", st.consecFail, 1)

  // 第二次失败：达到 failThreshold=2，判离线
  st = P.mergeResult(st, result({}), SET)
  eq("二次失败→offline", st.status, "offline")
  eq("  连续失败计数=2", st.consecFail, 2)

  // 恢复：立刻回绿，退避清零
  st = P.mergeResult(st, result({ outcome: "online", rtt: 50 }), SET)
  eq("恢复→online", st.status, "online")
  eq("  失败计数清零", st.consecFail, 0)
  eq("  退避清零", st.nextProbeAt, 0)
}

// ================================================ 2. failThreshold=1 立即红
{
  const s1 = { ...SET, failThreshold: 1 }
  let st = P.mergeResult(T.emptyState(), result({}), s1)
  eq("阈值=1 时首次失败即 offline", st.status, "offline")
  ok("  且已设置退避", st.nextProbeAt > Date.now())
}

// ================================================ 3. 指数退避
{
  const s = { ...SET, failThreshold: 1, backoffBaseMin: 5, backoffFactor: 2, backoffMaxMin: 60 }
  let st = T.emptyState()
  const gaps = []
  for (let i = 0; i < 6; i++) {
    st = P.mergeResult(st, result({}), s)
    gaps.push(Math.round((st.nextProbeAt - st.lastProbeAt) / 60000))
  }
  eq("退避序列 5→10→20→40→60→60（封顶）", gaps, [5, 10, 20, 40, 60, 60])
  ok("退避不超过上限", gaps.every(g => g <= s.backoffMaxMin))
}

// ================================================ 4. degradedMs 慢速判定
{
  const s = { ...SET, degradedMs: 400 }
  let fast = P.mergeResult(T.emptyState(), result({ outcome: "online", rtt: 120 }), s)
  eq("延迟 120ms → online", fast.status, "online")
  let slow = P.mergeResult(T.emptyState(), result({ outcome: "online", rtt: 900 }), s)
  eq("延迟 900ms → degraded（黄灯）", slow.status, "degraded")
}

// ================================================ 5. shouldProbe 退避门禁
{
  const now = Date.now()
  ok("无退避时该探", P.shouldProbe({ ...T.emptyState(), nextProbeAt: 0 }, now))
  ok("退避未到不探", !P.shouldProbe({ ...T.emptyState(), nextProbeAt: now + 60000 }, now))
  ok("退避已过要探", P.shouldProbe({ ...T.emptyState(), nextProbeAt: now - 1 }, now))
}

// ================================================ 6. 环形历史不超上限
{
  let st = T.emptyState()
  const s = { ...SET, historyPoints: 10 }
  for (let i = 0; i < 25; i++) {
    st = P.mergeResult(st, result({ outcome: "online", rtt: i }), s)
  }
  eq("历史长度封顶在 10", st.history.length, 10)
  eq("保留的是最新的点", st.history[st.history.length - 1].r, 24)
  eq("最老的点已被丢弃", st.history[0].r, 15)
}

// ================================================ 7. 可用率 / 平均延迟
{
  const st = { ...T.emptyState(), history: [
    { t: 1, r: 100 }, { t: 2, r: -1 }, { t: 3, r: 200 }, { t: 4, r: -1 },
  ]}
  eq("可用率 2/4 = 0.5", F.uptimeRatio(st), 0.5)
  eq("平均延迟只算成功点 (100+200)/2", F.avgRtt(st), 150)
  eq("无历史时可用率为 null", F.uptimeRatio(T.emptyState()), null)
  eq("无历史时显示占位符", F.fmtUptime(T.emptyState()), "—")
}

// ================================================ 8. tally / overallStatus
{
  const t = F.tally(["online", "online", "offline", "degraded", "unknown"])
  eq("统计 total", t.total, 5)
  eq("统计 online", t.online, 2)
  eq("统计 trouble = 离线+不稳定", t.trouble, 2)
  eq("有离线时整体判离线", F.overallStatus(t), "offline")
  eq("全绿时整体在线", F.overallStatus(F.tally(["online", "online"])), "online")
  eq("空列表 unknown", F.overallStatus(F.tally([])), "unknown")
  eq("只有慢的→degraded", F.overallStatus(F.tally(["online", "degraded"])), "degraded")
}

// ================================================ 9. 国旗推导
{
  eq("JP→🇯🇵", T.countryFlag("JP"), "🇯🇵")
  eq("us 小写也行", T.countryFlag("us"), "🇺🇸")
  eq("非法输入给白旗", T.countryFlag("XYZ"), "🏳️")
  eq("空值给白旗", T.countryFlag(undefined), "🏳️")
}

// ================================================ 10. IP 字面量识别
{
  ok("识别 IPv4", P.isIPLiteral("1.2.3.4"))
  ok("识别 IPv6", P.isIPLiteral("2001:db8::1"))
  ok("域名不是字面量", !P.isIPLiteral("example.com"))
  ok("拒绝越界八位组", !P.isIPLiteral("999.1.1.1"))
  ok("拒绝前导零", !P.isIPLiteral("01.2.3.4"))
}

// ================================================ 11. 排序
{
  const hosts = [
    { id: "a", alias: "北京", order: 0 },
    { id: "b", alias: "东京", order: 1 },
    { id: "c", alias: "洛杉矶", order: 2 },
  ]
  const snap = { updatedAt: 0, networkOk: true, states: {
    a: { ...T.emptyState(), status: "online", rtt: 200 },
    b: { ...T.emptyState(), status: "offline", rtt: -1 },
    c: { ...T.emptyState(), status: "online", rtt: 50 },
  }}
  eq("按状态：离线的排最前", S.sortHosts(hosts, snap, "status").map(h => h.id), ["b", "a", "c"])
  eq("按延迟：快的在前，无数据垫底", S.sortHosts(hosts, snap, "rtt").map(h => h.id), ["c", "a", "b"])
  eq("自定义顺序按 order", S.sortHosts(hosts, snap, "custom").map(h => h.id), ["a", "b", "c"])
}

// ================================================ 12. Storage 往返
{
  const hosts = [{ id: "x1", alias: "测试机", address: "1.1.1.1", ip: "1.1.1.1",
                   probe: { type: "tcp", port: 22 }, order: 0, createdAt: Date.now() }]
  S.saveHosts(hosts)
  const back = S.loadHosts()
  eq("主机存取往返", back.length, 1)
  eq("  别名保持", back[0].alias, "测试机")

  // 缺字段的老数据要能补齐，不能让 UI 炸
  global.Storage.set("vpsguard.hosts.v1", [{ id: "y1", address: "2.2.2.2" }])
  const fixed = S.loadHosts()
  eq("老数据补出别名", fixed[0].alias, "2.2.2.2")
  eq("老数据补出探测配置", fixed[0].probe.port, 22)
  eq("老数据补出 ip", fixed[0].ip, "2.2.2.2")

  // 设置合并：新增字段不该是 undefined
  global.Storage.set("vpsguard.settings.v1", { timeoutSec: 9 })
  const st = S.loadSettings()
  eq("设置保留用户值", st.timeoutSec, 9)
  eq("设置补齐新字段", st.failThreshold, T.DEFAULT_SETTINGS.failThreshold)
}

// ================================================ 13. 孤儿状态清理
{
  const snap = { updatedAt: 1, networkOk: true, states: {
    keep: T.emptyState(), orphan: T.emptyState(),
  }}
  const pruned = S.pruneSnapshot(snap, [{ id: "keep" }])
  eq("保留存活主机状态", Object.keys(pruned.states), ["keep"])
}

// ================================================ 14. 格式化
{
  eq("延迟 -1 显示占位", F.fmtRtt(-1), "—")
  eq("延迟正常带单位", F.fmtRtt(123), "123ms")
  const now = Date.now()
  eq("刚刚", F.relTime(now - 5000, now), "刚刚")
  ok("分钟级", F.relTime(now - 5 * 60000, now).includes("分钟"))
  ok("小时级", F.relTime(now - 3 * 3600000, now).includes("小时"))
  eq("从未发生", F.relTime(0, now), "从未")
}

// ================================================ 15. error 结果不冤枉主机
{
  // 地址解析失败属于我们这边的问题，但仍要计入失败（否则永远不告警）
  let st = P.mergeResult(T.emptyState(), result({ outcome: "error", detail: "地址无法解析" }), SET)
  ok("error 也计失败次数", st.consecFail === 1)
  eq("  但先标 degraded 而非 offline", st.status, "degraded")
}

// ---------------------------------------------- 汇总
console.log(`\n通过 ${pass} / ${pass + fail}`)
if (fails.length) {
  console.log("\n失败项：")
  fails.forEach(f => console.log("  ✗ " + f))
  process.exit(1)
} else {
  console.log("全部通过 ✓")
}
