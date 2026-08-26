"use strict";
/**
 * VPS 红绿灯 — 数据模型与默认配置（本文件是唯一的模型真相来源）
 *
 * 设计约束（来自 Scripting 官方文档，务必牢记）：
 * 1. widget.tsx 是「一次性渲染」，hooks 全部无效，Widget.present() 之后的代码不执行。
 * 2. 小组件内存上限约 30MB，不要在小组件里做重活（geo 查询、DNS 解析一律不做）。
 * 3. 刷新时机由 WidgetKit 决定，reloadPolicy 只是「请求」，实际是分钟级。
 * 4. 同一个脚本项目内 index.tsx / widget.tsx / app_intents.tsx 共享同一个 Storage 域，
 *    所以不需要 shared: true。
 * 5. 不使用任何 PRO 功能（Widget.openApp / Spotlight / 重定向规则 / Health 等一律不碰）。
 * 6. 小组件是纯展示层：只同步读 Storage 快照渲染，绝不做网络请求
 *    （官方模板同构；探测全部在 App 内完成）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROBE = exports.DEFAULT_SETTINGS = void 0;
exports.emptyState = emptyState;
exports.clampRtt = clampRtt;
exports.countryFlag = countryFlag;
exports.statusColor = statusColor;
exports.statusLabel = statusLabel;
exports.DEFAULT_SETTINGS = {
    timeoutSec: 5,
    retries: 2,
    retryGapMs: 700,
    failThreshold: 2,
    backoffBaseMin: 5,
    backoffFactor: 2,
    backoffMaxMin: 60,
    degradedMs: 800,
    refreshMinutes: 15,
    probeInWidget: true,
    sentinelUrl: "https://1.1.1.1/cdn-cgi/trace",
    showRtt: true,
    showGeo: true,
    showSparkline: true,
    sortMode: "status",
    historyPoints: 288,
    accent: "systemBlue",
};
exports.DEFAULT_PROBE = {
    type: "auto",
    port: 0,
};
function emptyState() {
    return {
        status: "unknown",
        rtt: -1,
        lastProbeAt: 0,
        lastOnlineAt: 0,
        consecFail: 0,
        nextProbeAt: 0,
        detail: "还没探测过",
        attempts: 0,
        history: [],
    };
}
/**
 * 延迟值消毒。
 * 设备卡顿、系统调度抖动都会让墙上时间变得离谱，直接存进历史会把曲线拉爆。
 * 这里把它夹到合理区间：至少 1ms（0 看着像没测），最多 60s。
 */
function clampRtt(ms) {
    if (!Number.isFinite(ms))
        return -1;
    return Math.max(1, Math.min(60000, Math.round(ms)));
}
/**
 * 由两位国家代码推导国旗 emoji。
 * 用本地计算而不是下载图片 —— 小组件只有 30MB 内存，能省一次网络就省一次。
 */
function countryFlag(code) {
    if (!code || code.length !== 2 || !/^[a-zA-Z]{2}$/.test(code))
        return "🏳️";
    const base = 0x1f1e6;
    const upper = code.toUpperCase();
    return String.fromCodePoint(base + (upper.charCodeAt(0) - 65), base + (upper.charCodeAt(1) - 65));
}
/** 状态对应的灯色。语义集中在这里，UI 各处不要各写一套 */
function statusColor(status) {
    switch (status) {
        case "online":
            return "systemGreen";
        case "offline":
            return "systemRed";
        case "degraded":
            return "systemOrange";
        default:
            return "systemGray";
    }
}
function statusLabel(status) {
    switch (status) {
        case "online":
            return "在线";
        case "offline":
            return "离线";
        case "degraded":
            return "不稳定";
        default:
            return "未知";
    }
}
