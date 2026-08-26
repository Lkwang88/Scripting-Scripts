/**
 * 小组件渲染路径的本地运行时测试。
 *
 * 目的：widget.tsx 在真机上白屏，但桌面端没有 Scripting 宿主。
 * 这里用 node + 桩模块把 widget.tsx 的 main() 真正跑一遍：
 * - JSX 用自定义 h() 编译成纯对象
 * - Widget/Script/Storage/fetch 全部 mock
 * - 看 Widget.present 是否被调到、抛了什么异常
 *
 * 这抓的是 JS 层崩溃；桥接层的属性校验问题抓不到，那只能真机验。
 */

const path = require("path")
const fs = require("fs")

// ---------- JSX 工厂：tsc -jsx react -jsxFactory h 会调到它 ----------
global.h = (type, props, ...children) => ({ type, props: props ?? {}, children })

// ---------- mock 宿主全局 ----------
const storeData = {
  "vpsguard.hosts.v1": JSON.stringify([
    {
      id: "test1",
      alias: "北卡VPS",
      address: "130.12.168.234",
      ip: "130.12.168.234",
      probe: { type: "tcp", port: 22 },
      order: 0,
      createdAt: Date.now(),
    },
  ]),
}
global.Storage = {
  get: k => (k in storeData ? JSON.parse(storeData[k]) : null),
  set: (k, v) => { storeData[k] = JSON.stringify(v); return true },
  remove: k => { delete storeData[k] },
  contains: k => k in storeData,
}

const presentCalls = []
global.Widget = {
  family: "systemMedium",
  displaySize: { width: 329, height: 155 },
  parameter: "",
  present: (el, opts) => { presentCalls.push({ el, opts }) },
  reloadAll: () => {},
}
global.Script = {
  name: "VPS Guard",
  directory: "/tmp",
  env: "widget",
  widgetParameter: "",
  queryParameters: {},
  exit: () => {},
  createOpenURLScheme: name => `scripting://run/${name}`,
}
// 网络全部失败 → 走「本机无网络」分支
global.fetch = async () => { throw new Error("network down (test)") }
global.setTimeout = global.setTimeout // node 自带
global.clearTimeout = global.clearTimeout

// ---------- 加载编译产物 ----------
// 桩掉 "scripting" 模块
const stubDir = path.join(__dirname, "build_node", "scripting")
fs.mkdirSync(stubDir, { recursive: true })
fs.writeFileSync(
  path.join(stubDir, "index.js"),
  `
const h = global.h
const mk = name => {
  const fn = (props = {}, ...children) => h(name, props, ...children)
  fn.__intrinsic = true
  return fn
}
const comps = ["VStack","HStack","ZStack","Text","Image","Circle","Capsule","Spacer",
  "Rectangle","RoundedRectangle","List","Section","Button","Menu","Toggle","TextField",
  "Picker","NavigationStack","NavigationLink","ScrollView","Divider","Label","Gauge",
  "ProgressView","LazyVStack","Grid","GridRow","Group","Link","EditButton","Stepper",
  "ContentUnavailableView","AccessoryWidgetBackground","GeometryReader","ForEach"]
const exportsObj = {}
for (const c of comps) exportsObj[c] = mk(c)
exportsObj.useState = init => [typeof init === "function" ? init() : init, () => {}]
exportsObj.useEffect = () => {}
exportsObj.useMemo = f => f()
exportsObj.useCallback = f => f
exportsObj.useReducer = (r, i) => [i, () => {}]
exportsObj.Navigation = { present: async () => {}, push: async () => {}, useDismiss: () => () => {} }
exportsObj.Widget = global.Widget
exportsObj.Script = global.Script
exportsObj.Dialog = {
  alert: async () => {}, confirm: async () => true,
  prompt: async () => null, actionSheet: async () => null,
}
exportsObj.AppIntentManager = { register: () => () => ({}) }
exportsObj.AppIntentProtocol = {}
exportsObj.modifiers = () => ({})
module.exports = exportsObj
`,
)

// 让 require("scripting") 命中桩：用 Module 原型 hack 或直接路径替换
const Module = require("module")
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...args) {
  if (request === "scripting") return path.join(stubDir, "index.js")
  return origResolve.call(this, request, ...args)
}

const buildDir = path.join(__dirname, "build_node")
fs.mkdirSync(buildDir, { recursive: true })

// ---------- 编译 widget.tsx（CommonJS + h 工厂）----------
const { execSync } = require("child_process")
const tsc = path.join(__dirname, "node_modules", "typescript", "lib", "tsc.js")
const repoRoot = path.dirname(__dirname)
try {
  execSync(
    `node "${tsc}" "VPS-Guard/widget.tsx" ".dev/scripting.d.ts" --outDir "${buildDir}" --module commonjs ` +
      `--target es2020 --moduleResolution node --esModuleInterop --skipLibCheck ` +
      `--jsx react --jsxFactory h --strict false --noUnusedLocals false --lib es2020`,
    { cwd: repoRoot, stdio: "pipe" },
  )
} catch {
  // JSX 工厂 h 的类型报错可忽略（h 由本 harness 在运行时提供），
  // tsc 默认带错也会 emit，下面检查产物即可。
}
// tsc 对 JSX 工厂 h 的类型检查会报错（h 只在运行时由 harness 提供），
// 但产物已正常 emit —— 产物存在就继续，别因退出码中断。
if (!fs.existsSync(path.join(buildDir, "widget.js"))) {
  console.log("✗ 编译没有产出 widget.js")
  process.exit(1)
}

// ---------- 运行 main() ----------
async function main() {
  const widgetJs = path.join(buildDir, "widget.js")
  delete require.cache[widgetJs]
  require(widgetJs) // 文件末尾会调 main().catch(...)

  // 给异步链路一点时间
  await new Promise(r => setTimeout(r, 3000))

  console.log("════ 结果 ════")
  if (presentCalls.length === 0) {
    console.log("✗ Widget.present 未被调用 —— 小组件会白屏")
    process.exit(1)
  }
  console.log(`✓ Widget.present 被调用 ${presentCalls.length} 次`)
  const c = presentCalls[0]
  console.log("  reloadPolicy:", JSON.stringify(c.opts))
  console.log("  根元素 type:", c.el.type)
  const flat = JSON.stringify(c.el, (k, v) => (k === "children" ? undefined : v))
  console.log("  根元素 props keys:", Object.keys(c.el.props ?? {}))
  // 抽查内容里是否包含预期文案
  const all = JSON.stringify(c.el)
  for (const marker of ["在线", "本机无网络", "还没有添加服务器", "北卡VPS"]) {
    console.log(`  含「${marker}」:`, all.includes(marker) ? "✓" : "—")
  }
  // 倒出全部字符串叶子。组件类型的元素要像 React 一样递归调用解析
  const strings = []
  const walk = (n, depth = 0) => {
    if (depth > 64) { strings.push("‼️ 递归超深，已截断"); return }
    if (n == null || typeof n === "boolean") return
    if (typeof n === "string" || typeof n === "number") { strings.push(String(n)); return }
    if (Array.isArray(n)) return n.forEach(x => walk(x, depth + 1))
    if (typeof n === "object") {
      if (typeof n.type === "function") {
        if (n.type.__intrinsic) {
          // intrinsic：children 已在元素上，直接下钻
          return walk(n.children, depth + 1)
        }
        try {
          const props = { ...(n.props ?? {}) }
          if (n.children !== undefined) props.children = n.children
          return walk(n.type(props), depth + 1)
        } catch (e) {
          strings.push(`‼️ 组件渲染抛异常: ${e && e.message}`)
          if (e && e.stack) strings.push(e.stack.split("\n").slice(1, 5).join("\n"))
          return
        }
      }
      if (n.children !== undefined) walk(n.children, depth + 1)
      if (n.props) for (const v of Object.values(n.props)) {
        if (typeof v === "string") strings.push(`[prop] ${v}`)
      }
    }
  }
  console.log("  [debug] root children 数:", Array.isArray(c.el.children) ? c.el.children.length : typeof c.el.children)
  const b = c.el.children && c.el.children[0]
  if (b) {
    console.log("  [debug] body type:", typeof b.type === "function" ? (b.type.name || "anon") : b.type)
    console.log("  [debug] body children:", JSON.stringify(b.children)?.slice(0, 120))
  }
  walk(c.el)
  console.log("  ── 渲染的文本 ──")
  strings.slice(0, 40).forEach(t => console.log("   ", JSON.stringify(t)))
}

main().catch(e => {
  console.log("✗ main() 抛异常:", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e)
  process.exit(1)
})
