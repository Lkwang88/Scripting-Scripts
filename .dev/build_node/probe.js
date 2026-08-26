"use strict";
/**
 * 探测引擎。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 为什么不用 ping？
 *
 * Scripting 没有暴露原始 socket，Shell 走的是内嵌 ios_system，官方命令清单
 * 里并没有点名 ping（而且 iOS 对 ICMP 本身有沙盒限制）。所以 ICMP 只能当
 * 「真机自检通过后才启用」的可选项，主力探测走 fetch。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 用 fetch 怎么判断「机器活着」？
 *
 * 关键洞察：对「VPS 是否在线」这个问题，只要对方 TCP 栈给了任何回应，机器
 * 就是活的。四种情况：
 *
 *   1. 端口开着且是 HTTP    → 拿到 Response
 *   2. 端口开着但不是 HTTP  → 握手成功后解析失败，**很快**报错（SSH 22 就是这种）
 *   3. 端口关着            → 内核回 RST，**很快**报 connection refused
 *   4. 机器死了 / 包被丢弃  → 一直没人应答，**耗到 timeout** 才 AbortError
 *
 * 1、2、3 都说明机器在线，只有 4 是离线。于是判定规则简化成一句话：
 *
 *     「快速失败」= 在线，「超时」= 离线。
 *
 * 这比 ICMP 可靠得多 —— 很多机房默认丢 ICMP，ping 不通根本不代表机器挂了。
 *
 * ─────────────────────────────────────────────────────────────────────
 * 假阳性的防线：哨兵
 *
 * 上面的规则有个致命前提 —— 手机本身有网。地铁里没信号时，所有主机都会
 * 「超时」，于是十台机器一起变红，纯属冤枉。所以每轮探测先打一次哨兵
 * （Cloudflare trace），哨兵不通就整轮作废，界面显示「本机无网络」而不是
 * 一片红灯。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIPLiteral = isIPLiteral;
exports.resolveDomain = resolveDomain;
exports.lookupGeo = lookupGeo;
exports.detectIcmpSupport = detectIcmpSupport;
exports.checkNetwork = checkNetwork;
exports.probeHost = probeHost;
exports.mergeResult = mergeResult;
exports.shouldProbe = shouldProbe;
exports.runRound = runRound;
const types_1 = require("./types");
const store_1 = require("./store");
// ---------------------------------------------------------------- 工具
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function isIPv4(s) {
    const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m)
        return false;
    return m.slice(1).every(p => {
        const n = Number(p);
        return n >= 0 && n <= 255 && String(n) === p;
    });
}
function isIPv6(s) {
    // 够用的粗判：有冒号且只含合法字符
    return s.includes(":") && /^[0-9a-fA-F:.]+$/.test(s);
}
function isIPLiteral(s) {
    return isIPv4(s) || isIPv6(s);
}
/** IPv6 放进 URL 要用方括号包起来 */
function hostForUrl(ip) {
    return isIPv6(ip) ? `[${ip}]` : ip;
}
// ---------------------------------------------------------------- DNS（DoH）
/**
 * 域名解析走 DoH。额外好处：把解析出的 IP 存下来，VPS 换 IP 时能直接看出来。
 */
async function resolveDomain(domain, timeoutSec = 8) {
    const endpoints = [
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
    ];
    for (const url of endpoints) {
        try {
            const resp = await fetch(url, {
                headers: { accept: "application/dns-json" },
                timeout: timeoutSec,
            });
            if (!resp.ok)
                continue;
            const json = await resp.json();
            if (json.Status !== 0 || !json.Answer)
                continue;
            // type 1 = A 记录；CNAME 链里的中间记录要跳过
            const a = json.Answer.find(x => x.type === 1 && isIPv4(x.data));
            if (a)
                return { ip: a.data };
        }
        catch {
            // 换下一个 endpoint
        }
    }
    return { ip: null, error: "域名解析失败" };
}
// ---------------------------------------------------------------- 归属地
/**
 * 归属地查询。只在添加主机 / 手动刷新时调用，绝不在 widget.tsx 里调
 * —— 小组件只有 30MB 内存和一次性渲染，不该干网络活。
 */
async function lookupGeo(ip) {
    // 首选 ip-api：有中文地名，免费无 key（限速 45 次/分钟，我们远远用不到）
    try {
        const url = `http://ip-api.com/json/${encodeURIComponent(ip)}` +
            `?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,isp,as`;
        const resp = await fetch(url, { timeout: 10, allowInsecureRequest: true });
        if (resp.ok) {
            const j = await resp.json();
            if (j.status === "success") {
                return {
                    geo: {
                        country: j.country ?? "",
                        countryCode: j.countryCode ?? "",
                        flag: (0, types_1.countryFlag)(j.countryCode ?? ""),
                        region: j.regionName ?? "",
                        city: j.city ?? "",
                        isp: j.isp ?? "",
                        asn: j.as ?? "",
                        at: Date.now(),
                    },
                };
            }
        }
    }
    catch {
        // 落到备选
    }
    // 备选 ipwho.is：HTTPS、字段全，地名是英文
    try {
        const resp = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
            timeout: 10,
        });
        if (resp.ok) {
            const j = await resp.json();
            if (j.success) {
                return {
                    geo: {
                        country: j.country ?? "",
                        countryCode: j.country_code ?? "",
                        flag: j.flag?.emoji ?? (0, types_1.countryFlag)(j.country_code ?? ""),
                        region: j.region ?? "",
                        city: j.city ?? "",
                        isp: j.connection?.isp ?? "",
                        asn: j.connection?.asn ? `AS${j.connection.asn}` : "",
                        at: Date.now(),
                    },
                };
            }
        }
    }
    catch {
        // 两家都挂了
    }
    return { error: "归属地查询失败" };
}
/** 一次 fetch 探测。核心逻辑：快速失败=在线，超时=离线 */
async function probeOnceHttp(ip, port, https, path, expectStatus, timeoutSec) {
    const scheme = https ? "https" : "http";
    const url = `${scheme}://${hostForUrl(ip)}:${port}${path || "/"}`;
    const started = Date.now();
    try {
        const resp = await fetch(url, {
            timeout: timeoutSec,
            allowInsecureRequest: true,
            // 不跟随重定向，省一趟往返；我们只关心「有人应答」
            handleRedirect: async () => null,
            debugLabel: `VPSGuard ${ip}:${port}`,
        });
        const rtt = (0, types_1.clampRtt)(Date.now() - started);
        // 指定了期望状态码就严格比对，否则「有响应」即在线
        if (expectStatus != null && resp.status !== expectStatus) {
            return {
                outcome: "degraded",
                rtt,
                detail: `HTTP ${resp.status}（期望 ${expectStatus}）`,
                httpStatus: resp.status,
            };
        }
        return {
            outcome: "online",
            rtt,
            detail: `HTTP ${resp.status}`,
            httpStatus: resp.status,
        };
    }
    catch (e) {
        const rtt = Date.now() - started;
        const msg = String(e?.message ?? e ?? "");
        const budget = timeoutSec * 1000;
        // 走到 timeout 才失败 → 没人应答 → 离线
        // 留 15% 余量，避免设备卡顿造成的误判
        if (rtt >= budget * 0.85) {
            return { outcome: "offline", rtt: -1, detail: "连接超时，无响应" };
        }
        // 明确的 DNS 类错误：地址本身有问题，不是机器挂了
        if (/cannot find host|hostname could not be found|nodename|dns/i.test(msg)) {
            return { outcome: "error", rtt: -1, detail: "地址无法解析" };
        }
        // 其余快速失败 = 对方 TCP 栈有回应 = 机器在线
        let detail = "端口有响应";
        if (/refused/i.test(msg))
            detail = "端口关闭（机器在线）";
        else if (/ssl|tls|certificate|secure/i.test(msg))
            detail = "TLS 异常（机器在线）";
        else if (/parse|protocol|malformed|unsupported|invalid response/i.test(msg)) {
            detail = "非 HTTP 服务（机器在线）";
        }
        return { outcome: "online", rtt: (0, types_1.clampRtt)(rtt), detail };
    }
}
/** ICMP 探测。只在真机自检确认 ping 可用后才会被调用 */
async function probeOnceIcmp(ip, timeoutSec) {
    const started = Date.now();
    try {
        const waitSec = Math.max(1, Math.round(timeoutSec));
        const r = await Shell.run(`ping -c 1 -W ${waitSec} ${ip}`, {
            timeout: timeoutSec + 3,
        });
        if (r.timedOut)
            return { outcome: "offline", rtt: -1, detail: "ping 超时" };
        if (r.exitCode === 0) {
            // 优先从输出里抠真实 RTT，抠不到用墙上时间兜底
            const m = r.output.match(/time[=<]\s*([\d.]+)\s*ms/i);
            const rtt = (0, types_1.clampRtt)(m ? Math.round(Number(m[1])) : Date.now() - started);
            return { outcome: "online", rtt, detail: `ICMP ${rtt}ms` };
        }
        return { outcome: "offline", rtt: -1, detail: "ping 无响应" };
    }
    catch (e) {
        const msg = String(e?.message ?? e ?? "");
        return { outcome: "error", rtt: -1, detail: `ping 不可用：${msg}` };
    }
}
/**
 * 自检 ios_system 有没有 ping。结果缓存进 Storage，只测一次。
 * 用 127.0.0.1 —— 不依赖外网，本地回环必然通。
 */
async function detectIcmpSupport(force = false) {
    if (!force) {
        const cached = (0, store_1.loadIcmpAvailable)();
        if (cached !== null)
            return cached;
    }
    let ok = false;
    try {
        const r = await Shell.run("ping -c 1 127.0.0.1", { timeout: 8 });
        // 命令不存在时 ios_system 会输出 command not found 一类的信息
        ok = r.exitCode === 0 && !/not found|no such|unknown command|illegal/i.test(r.output);
    }
    catch {
        ok = false;
    }
    (0, store_1.saveIcmpAvailable)(ok);
    return ok;
}
// ---------------------------------------------------------------- 哨兵
/**
 * 本机联网自检。返回 false 表示手机没网 —— 这一轮的所有「离线」都不可信。
 */
async function checkNetwork(settings) {
    try {
        const resp = await fetch(settings.sentinelUrl, {
            timeout: Math.max(2, Math.min(settings.timeoutSec, 8)),
            debugLabel: "VPSGuard sentinel",
        });
        return resp.ok || resp.status > 0;
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------- 带重试的探测
/**
 * 探测一台主机：先探一次，失败就按配置重试若干次（间隔递增），
 * 全都失败才判失败。这就是「不通就连续探几下，再不通才标离线」。
 */
async function probeHost(host, settings, icmpAvailable) {
    const startedAt = Date.now();
    // 域名：先解析成 IP 再探测
    let ip = host.ip || host.address;
    let resolvedIp;
    if (!isIPLiteral(host.address)) {
        const r = await resolveDomain(host.address, settings.timeoutSec);
        if (!r.ip) {
            return {
                hostId: host.id,
                outcome: "error",
                rtt: -1,
                detail: r.error ?? "域名解析失败",
                attempts: 1,
                startedAt,
                finishedAt: Date.now(),
            };
        }
        ip = r.ip;
        resolvedIp = r.ip;
    }
    // ICMP 不可用时自动降级到 TCP，不让用户对着一个永远报错的配置发愁
    const useIcmp = host.probe.type === "icmp" && icmpAvailable;
    const downgraded = host.probe.type === "icmp" && !icmpAvailable;
    const totalTries = 1 + Math.max(0, settings.retries);
    let last = { outcome: "error", rtt: -1, detail: "未执行" };
    for (let attempt = 1; attempt <= totalTries; attempt++) {
        if (useIcmp) {
            last = await probeOnceIcmp(ip, settings.timeoutSec);
        }
        else {
            last = await probeOnceHttp(ip, host.probe.port, host.probe.type === "http" ? host.probe.https === true : false, host.probe.path ?? "/", host.probe.type === "http" ? host.probe.expectStatus : undefined, settings.timeoutSec);
        }
        // 成功就立刻返回，不浪费重试
        if (last.outcome === "online") {
            return {
                hostId: host.id,
                outcome: "online",
                rtt: last.rtt,
                detail: downgraded ? `${last.detail}・ICMP 不可用已降级 TCP` : last.detail,
                httpStatus: last.httpStatus,
                attempts: attempt,
                resolvedIp,
                startedAt,
                finishedAt: Date.now(),
            };
        }
        // 还有下一轮就退避一下再试（间隔随次数递增）
        if (attempt < totalTries) {
            await sleep(settings.retryGapMs * attempt);
        }
    }
    return {
        hostId: host.id,
        outcome: last.outcome,
        rtt: last.outcome === "degraded" ? last.rtt : -1,
        detail: downgraded ? `${last.detail}・ICMP 不可用已降级 TCP` : last.detail,
        httpStatus: last.httpStatus,
        attempts: totalTries,
        resolvedIp,
        startedAt,
        finishedAt: Date.now(),
    };
}
// ---------------------------------------------------------------- 状态合并
/**
 * 把探测结果并进主机状态。
 *
 * 摇摆抑制：连续失败没到 failThreshold 时先标 degraded（黄灯），够了才判
 * offline（红灯）。这样一次网络抽风不会让小组件闪红。
 *
 * 退避：连续失败越多，下次探测越晚，指数增长但有上限。省电，也避免对一台
 * 已经确认躺平的机器反复敲门。
 */
function mergeResult(prev, result, settings) {
    const now = result.finishedAt;
    const base = prev ?? (0, types_1.emptyState)();
    if (result.outcome === "online" || result.outcome === "degraded") {
        const isDegraded = result.outcome === "degraded" ||
            (result.rtt >= 0 && result.rtt >= settings.degradedMs);
        const next = {
            ...base,
            status: isDegraded ? "degraded" : "online",
            rtt: result.rtt,
            lastProbeAt: now,
            lastOnlineAt: now,
            consecFail: 0,
            // 恢复后立刻回到正常节奏
            nextProbeAt: 0,
            detail: result.detail,
            attempts: result.attempts,
        };
        return (0, store_1.pushSample)(next, { t: Math.round(now / 1000), r: result.rtt }, settings.historyPoints);
    }
    const fails = base.consecFail + 1;
    const status = fails >= settings.failThreshold ? "offline" : "degraded";
    // 指数退避：base * factor^(超出阈值的次数)，封顶 backoffMaxMin
    const over = Math.max(0, fails - settings.failThreshold);
    const backoffMin = Math.min(settings.backoffMaxMin, settings.backoffBaseMin * Math.pow(settings.backoffFactor, over));
    const next = {
        ...base,
        status,
        rtt: -1,
        lastProbeAt: now,
        consecFail: fails,
        nextProbeAt: status === "offline" ? now + backoffMin * 60000 : 0,
        detail: result.detail,
        attempts: result.attempts,
    };
    return (0, store_1.pushSample)(next, { t: Math.round(now / 1000), r: -1 }, settings.historyPoints);
}
/** 该不该现在探这台？退避期内的跳过 */
function shouldProbe(state, now = Date.now()) {
    return !state.nextProbeAt || now >= state.nextProbeAt;
}
/**
 * 探测一轮。
 *
 * 顺序执行而不是并发 —— 十来台机器并发打出去，iOS 的连接池和 CPU 都吃紧，
 * 而且我们完全不赶时间。稳比快重要。
 */
async function runRound(hosts, snap, settings, options = {}) {
    const now = Date.now();
    // 哨兵：本机没网就整轮作废，不冤枉任何机器
    const networkOk = await checkNetwork(settings);
    if (!networkOk) {
        return { ...snap, updatedAt: now, networkOk: false };
    }
    const icmpAvailable = (0, store_1.loadIcmpAvailable)() ?? false;
    const states = { ...snap.states };
    const active = hosts.filter(h => !h.paused);
    const due = options.force
        ? active
        : active.filter(h => shouldProbe(states[h.id] ?? (0, types_1.emptyState)(), now));
    // 限流时优先探最久没探的，保证轮转覆盖
    const ordered = [...due].sort((a, b) => {
        const ta = (states[a.id] ?? (0, types_1.emptyState)()).lastProbeAt;
        const tb = (states[b.id] ?? (0, types_1.emptyState)()).lastProbeAt;
        return ta - tb;
    });
    const batch = options.limit ? ordered.slice(0, options.limit) : ordered;
    for (const host of batch) {
        // 预算用完就收工。没探到的主机保留上一次状态，下一轮因为按
        // lastProbeAt 升序排，它们会优先被照顾到，长期看每台都轮得到。
        if (options.budgetMs != null) {
            const spent = Date.now() - now;
            // 至少要留够一台的最坏耗时，否则开了头也做不完，白花时间
            const worstCase = settings.timeoutSec * 1000;
            if (spent + worstCase > options.budgetMs)
                break;
        }
        const prev = states[host.id] ?? (0, types_1.emptyState)();
        const result = await probeHost(host, settings, icmpAvailable);
        const merged = mergeResult(prev, result, settings);
        states[host.id] = merged;
        options.onEach?.(host.id, merged);
    }
    return { updatedAt: Date.now(), networkOk: true, states };
}
