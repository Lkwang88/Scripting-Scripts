"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const scripting_1 = require("scripting");
const types_1 = require("./types");
const store_1 = require("./store");
const probe_1 = require("./probe");
const app_intents_1 = require("./app_intents");
const format_1 = require("./format");
// ---------------------------------------------------------------- 布局预算
/**
 * 每种尺寸最多显示几行。数字是按 iPhone 上的实际点数估的：
 * large 约 340pt 高，头尾各占 ~30pt，每行 26pt，于是 11 行封顶。
 */
function rowCapacity(family) {
    switch (family) {
        case "systemLarge":
            return 11;
        case "systemMedium":
            return 4;
        case "systemSmall":
            return 3;
        default:
            return 1;
    }
}
function densityFor(family, count, settings) {
    if (family === "systemLarge") {
        const roomy = count <= 6;
        return {
            showSpark: settings.showSparkline && count <= 8,
            showGeo: settings.showGeo,
            rowFont: roomy ? "footnote" : "caption",
            dot: roomy ? 9 : 8,
            spacing: roomy ? 7 : 4,
        };
    }
    if (family === "systemMedium") {
        return {
            showSpark: false,
            showGeo: settings.showGeo && count <= 3,
            rowFont: "caption",
            dot: 8,
            spacing: 4,
        };
    }
    return {
        showSpark: false,
        showGeo: false,
        rowFont: "caption2",
        dot: 7,
        spacing: 3,
    };
}
// ---------------------------------------------------------------- 零件
/**
 * 状态灯。外圈用同色低透明度做一层光晕，比纯色圆点显得精致，
 * 而且离线时红色更醒目。两个视图换一点质感，值得。
 */
function Dot({ status, size }) {
    const color = (0, types_1.statusColor)(status);
    return (h(scripting_1.ZStack, { frame: { width: size + 6, height: size + 6 } },
        h(scripting_1.Circle, { fill: color, opacity: 0.22, frame: { width: size + 6, height: size + 6 } }),
        h(scripting_1.Circle, { fill: color, frame: { width: size, height: size } })));
}
/**
 * 迷你延迟图。用 Capsule 竖条拼，不用 Chart —— 小组件里视图越少越安全。
 * 失败的点画成低透明度的红条，一眼能看出「什么时候断过」。
 */
function Spark({ state, points, height, }) {
    const vals = (0, format_1.sparkPoints)(state.history, points);
    if (vals.length === 0) {
        return h(scripting_1.HStack, { frame: { width: 34, height } });
    }
    const ok = vals.filter(v => v >= 0);
    const max = ok.length > 0 ? Math.max(...ok) : 1;
    const floor = Math.max(2, height * 0.18);
    return (h(scripting_1.HStack, { spacing: 1.5, alignment: "bottom", frame: { width: 34, height } }, vals.map((v, i) => {
        const failed = v < 0;
        const ratio = failed || max <= 0 ? 1 : Math.max(0.12, v / max);
        return (h(scripting_1.Capsule, { key: i, fill: failed ? "systemRed" : "systemGreen", opacity: failed ? 0.45 : 0.75, frame: { width: 2.5, height: failed ? floor : Math.max(floor, ratio * height) } }));
    })));
}
/** 一行主机 */
function Row({ host, state, density, settings, }) {
    const dim = host.paused === true;
    return (h(scripting_1.HStack, { spacing: 6, opacity: dim ? 0.45 : 1 },
        h(Dot, { status: host.paused === true ? "unknown" : state.status, size: density.dot }),
        h(scripting_1.Text, { font: density.rowFont, fontWeight: "medium", lineLimit: 1, minScaleFactor: 0.85, foregroundStyle: "label" }, host.alias),
        density.showGeo && host.geo != null ? (h(scripting_1.Text, { font: "caption2", opacity: 0.75 }, host.geo.flag)) : null,
        h(scripting_1.Spacer, { minLength: 2 }),
        density.showSpark ? (h(Spark, { state: state, points: 10, height: 12 })) : null,
        settings.showRtt ? (h(scripting_1.Text, { font: density.rowFont, monospacedDigit: true, foregroundStyle: state.status === "offline"
                ? "systemRed"
                : state.status === "degraded"
                    ? "systemOrange"
                    : "secondaryLabel" }, host.paused === true ? "暂停" : (0, format_1.fmtRtt)(state.rtt))) : null));
}
/** 顶部条：一眼看清整体 */
function Header({ t, snap, compact, }) {
    const overall = (0, format_1.overallStatus)(t);
    return (h(scripting_1.HStack, { spacing: 6 },
        h(scripting_1.Image, { systemName: snap.networkOk
                ? overall === "online"
                    ? "checkmark.circle.fill"
                    : overall === "offline"
                        ? "exclamationmark.triangle.fill"
                        : "exclamationmark.circle.fill"
                : "wifi.slash", imageScale: compact ? "small" : "medium", foregroundStyle: snap.networkOk ? (0, types_1.statusColor)(overall) : "systemGray", widgetAccentable: true }),
        h(scripting_1.Text, { font: compact ? "caption" : "footnote", fontWeight: "semibold", foregroundStyle: "label", widgetAccentable: true }, snap.networkOk ? `${t.online}/${t.total} 在线` : "本机无网络"),
        h(scripting_1.Spacer, null),
        snap.updatedAt > 0 ? (h(scripting_1.Text, { font: "caption2", foregroundStyle: "tertiaryLabel" }, (0, format_1.relTimeShort)(snap.updatedAt))) : null,
        h(scripting_1.Button, { intent: (0, app_intents_1.RefreshIntent)(undefined) },
            h(scripting_1.Image, { systemName: "arrow.clockwise", imageScale: compact ? "small" : "medium", widgetAccentable: true }))));
}
/** 没有主机时的引导 */
function Empty() {
    return (h(scripting_1.VStack, { spacing: 6, padding: 12 },
        h(scripting_1.Image, { systemName: "server.rack", imageScale: "large", foregroundStyle: "secondaryLabel" }),
        h(scripting_1.Text, { font: "caption", fontWeight: "medium", foregroundStyle: "label" }, "\u8FD8\u6CA1\u6709\u6DFB\u52A0\u670D\u52A1\u5668"),
        h(scripting_1.Text, { font: "caption2", foregroundStyle: "secondaryLabel", multilineTextAlignment: "center" }, "\u6253\u5F00\u811A\u672C\u6DFB\u52A0\uFF0C\u652F\u6301 IP \u6216\u57DF\u540D")));
}
// ---------------------------------------------------------------- 各尺寸视图
function CircularView({ t }) {
    const ratio = t.total > 0 ? t.online / t.total : 0;
    return (h(scripting_1.ZStack, null,
        h(scripting_1.Circle, { stroke: { shapeStyle: "systemGray", strokeStyle: { lineWidth: 5 } }, opacity: 0.25 }),
        h(scripting_1.Circle, { trim: { from: 0, to: Math.max(0.02, ratio) }, stroke: {
                shapeStyle: (0, types_1.statusColor)((0, format_1.overallStatus)(t)),
                strokeStyle: { lineWidth: 5, lineCap: "round" },
            }, rotationEffect: { degrees: -90 } }),
        h(scripting_1.VStack, { spacing: 0 },
            h(scripting_1.Text, { font: "caption", fontWeight: "bold", monospacedDigit: true }, t.online),
            h(scripting_1.Text, { font: "caption2", foregroundStyle: "secondaryLabel", monospacedDigit: true },
                "/",
                t.total))));
}
function RectangularView({ t, snap, bad, }) {
    return (h(scripting_1.VStack, { alignment: "leading", spacing: 1 },
        h(scripting_1.HStack, { spacing: 4 },
            h(scripting_1.Image, { systemName: t.offline > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill", imageScale: "small", widgetAccentable: true }),
            h(scripting_1.Text, { font: "caption", fontWeight: "semibold", widgetAccentable: true }, snap.networkOk ? `VPS ${t.online}/${t.total}` : "本机无网络")),
        h(scripting_1.Text, { font: "caption2", lineLimit: 1, foregroundStyle: "secondaryLabel" }, bad.length > 0
            ? `${bad[0].host.alias} 离线`
            : snap.updatedAt > 0
                ? `全部正常・${(0, format_1.relTimeShort)(snap.updatedAt)}`
                : "尚未探测")));
}
/** 单机特写：小尺寸配 parameter 时用，一眼看一台重点机器 */
function FocusView({ host, state, settings, }) {
    return (h(scripting_1.VStack, { alignment: "leading", spacing: 4 },
        h(scripting_1.HStack, { spacing: 5 },
            h(Dot, { status: state.status, size: 9 }),
            h(scripting_1.Text, { font: "footnote", fontWeight: "semibold", lineLimit: 1, minScaleFactor: 0.8 }, host.alias),
            h(scripting_1.Spacer, null)),
        h(scripting_1.Spacer, { minLength: 0 }),
        h(scripting_1.HStack, { spacing: 3, alignment: "bottom" },
            h(scripting_1.Text, { font: "title", fontWeight: "bold", monospacedDigit: true, foregroundStyle: (0, types_1.statusColor)(state.status) }, state.rtt >= 0 ? String(state.rtt) : "—"),
            state.rtt >= 0 ? (h(scripting_1.Text, { font: "caption2", foregroundStyle: "secondaryLabel", padding: { bottom: 3 } }, "ms")) : null),
        settings.showSparkline ? h(Spark, { state: state, points: 14, height: 16 }) : null,
        h(scripting_1.Spacer, { minLength: 0 }),
        h(scripting_1.VStack, { alignment: "leading", spacing: 1 },
            settings.showGeo && host.geo != null ? (h(scripting_1.Text, { font: "caption2", foregroundStyle: "secondaryLabel", lineLimit: 1 },
                host.geo.flag,
                " ",
                host.geo.city || host.geo.country)) : null,
            h(scripting_1.Text, { font: "caption2", foregroundStyle: "tertiaryLabel", lineLimit: 1 }, state.lastProbeAt > 0 ? (0, format_1.relTimeShort)(state.lastProbeAt) : "尚未探测"))));
}
function ListView({ hosts, snap, settings, family, t, }) {
    const cap = rowCapacity(family);
    const shown = hosts.slice(0, cap);
    const hidden = hosts.length - shown.length;
    const density = densityFor(family, shown.length, settings);
    const compact = family !== "systemLarge";
    return (h(scripting_1.VStack, { alignment: "leading", spacing: density.spacing },
        h(Header, { t: t, snap: snap, compact: compact }),
        shown.map(host => (h(Row, { key: host.id, host: host, state: (0, store_1.stateOf)(snap, host.id), density: density, settings: settings }))),
        h(scripting_1.Spacer, { minLength: 0 }),
        hidden > 0 ? (h(scripting_1.Text, { font: "caption2", foregroundStyle: "tertiaryLabel" },
            "\u8FD8\u6709 ",
            hidden,
            " \u53F0\u672A\u663E\u793A")) : null));
}
// ---------------------------------------------------------------- 入口
// 小组件探测的固定安全参数（不进设置页，避免误配出白屏）：
// 每轮只探 2 台最久没探的（按 lastProbeAt 轮转，几次刷新覆盖全部），
// 禁用重试、单次 2s、总预算 6s —— 到点立刻渲染。
const WIDGET_PROBE_LIMIT = 2;
const WIDGET_TIMEOUT_SEC = 2;
const WIDGET_BUDGET_MS = 6000;
async function main() {
    try {
        await render();
    }
    catch {
        // 任何异常都要给出可见内容，绝不白屏
        scripting_1.Widget.present(h(scripting_1.Text, { font: "caption", foregroundStyle: "secondaryLabel" }, "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u6253\u5F00 App \u5237\u65B0"));
    }
}
async function render() {
    const family = scripting_1.Widget.family;
    const settings = (0, store_1.loadSettings)();
    const hosts = (0, store_1.loadHosts)();
    let snap = (0, store_1.loadSnapshot)();
    // 系统每次刷新小组件时顺手探几台 —— 数据新鲜度就来自这里。
    // v1.0.3 曾把这段砍掉（当时误判白屏根因是异步探测，真凶是 Widget
    // 未导入），结果小组件永远画旧快照，时间戳只有打开 App 才会动。
    if (hosts.length > 0) {
        try {
            const wSettings = { ...settings, timeoutSec: WIDGET_TIMEOUT_SEC, retries: 0 };
            snap = await (0, probe_1.runRound)(hosts, snap, wSettings, {
                limit: WIDGET_PROBE_LIMIT,
                budgetMs: WIDGET_BUDGET_MS,
            });
            (0, store_1.saveSnapshot)(snap);
        }
        catch (e) {
            // 探测失败就用上次的快照渲染
            console.log("[widget] 探测失败:", String(e?.message ?? e));
        }
    }
    const sorted = (0, store_1.sortHosts)(hosts, snap, settings.sortMode);
    const t = (0, format_1.tally)(sorted.map(x => (x.paused === true ? "unknown" : (0, store_1.stateOf)(snap, x.id).status)));
    const bad = sorted
        .filter(x => x.paused !== true)
        .map(x => ({ host: x, state: (0, store_1.stateOf)(snap, x.id) }))
        .filter(x => x.state.status === "offline" || x.state.status === "degraded");
    let body;
    if (hosts.length === 0) {
        body = h(Empty, null);
    }
    else if (family === "accessoryCircular") {
        body = h(CircularView, { t: t });
    }
    else if (family === "accessoryRectangular") {
        body = h(RectangularView, { t: t, snap: snap, bad: bad });
    }
    else if (family === "systemSmall") {
        // parameter 填了别名或 IP 就单机特写 —— 同一份代码，多个实例各看一台
        const key = (scripting_1.Widget.parameter ?? "").trim().toLowerCase();
        const focus = key.length > 0
            ? sorted.find(x => x.alias.toLowerCase() === key ||
                x.address.toLowerCase() === key ||
                x.ip.toLowerCase() === key)
            : undefined;
        body =
            focus != null ? (h(FocusView, { host: focus, state: (0, store_1.stateOf)(snap, focus.id), settings: settings })) : (h(ListView, { hosts: sorted, snap: snap, settings: settings, family: family, t: t }));
    }
    else {
        body = (h(ListView, { hosts: sorted, snap: snap, settings: settings, family: family, t: t }));
    }
    // 锁屏配件不要自绘背景，交给系统
    const isAccessory = family.startsWith("accessory");
    const root = isAccessory ? (body) : (h(scripting_1.VStack, { frame: { maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }, padding: { horizontal: 12, vertical: 10 }, widgetBackground: "systemBackground" }, body));
    // 给系统一个明确的刷新时间点（文档支持的形态）。
    // 注意：这只是「请求」，iOS 按预算调度，实际通常 15~60 分钟一次，
    // 手机闲置/夜间会更懒 —— 这是平台天花板，不是 bug。
    const next = new Date(Date.now() + Math.max(5, settings.refreshMinutes) * 60000);
    scripting_1.Widget.present(root, { policy: "after", date: next });
}
main();
