// ═══════════════════════════════════════════════════════════════
// quickjs 版 CommonJS 加载器 —— 跑测试不依赖 node（内存 <5MB）
// 用法：qjs --std cjs_loader.js
// 注意：script 模式（--std）下 std 是全局对象，无 import 语句；
//       scriptArgs[0] = 本脚本绝对路径。
// ═══════════════════════════════════════════════════════════════

// ---- node 环境 shim（quickjs 的 std.out/err 是缓冲的，必须 flush）----
globalThis.global = globalThis;
globalThis.console = {
  log: (...a) => { std.out.puts(a.map(String).join(" ") + "\n"); std.out.flush(); },
  error: (...a) => { std.err.puts("ERR: " + a.map(String).join(" ") + "\n"); std.err.flush(); },
  warn: (...a) => { std.err.puts("WARN: " + a.map(String).join(" ") + "\n"); std.err.flush(); },
};
globalThis.process = { exit: (c) => std.exit(c || 0) };
// 测试只测纯逻辑，不依赖定时器 —— 提供占位实现即可
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};

// ---- 简易路径工具 ----
function dirname(p) {
  const i = p.lastIndexOf("/");
  return i <= 0 ? p : p.slice(0, i);
}
function join(a, b) {
  if (a.endsWith("/")) return a + b;
  return a + "/" + b;
}
function normalize(p) {
  const parts = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

// ---- CJS 模块加载 ----
const __cache = {};

function _load(fullPath) {
  fullPath = normalize(fullPath);
  if (__cache[fullPath]) return __cache[fullPath].exports;

  const src = std.loadFile(fullPath);
  if (src === null) {
    std.err.puts("loadFile failed: " + fullPath + "\n");
    std.err.flush();
    std.exit(2);
  }

  const mod = { exports: {} };
  __cache[fullPath] = mod;

  function req(r) {
    if (!r.startsWith(".")) {
      throw new Error("外部模块不支持: " + r + " (from " + fullPath + ")");
    }
    let target = join(dirname(fullPath), r);
    if (!target.endsWith(".js")) target += ".js";
    return _load(target);
  }

  const wrapper = new Function(
    "module", "exports", "require", "__filename", "__dirname",
    '"use strict";\n' + src,
  );
  wrapper(mod, mod.exports, req, fullPath, dirname(fullPath));
  return mod.exports;
}

// ---- 入口：loader 同目录下的 test.js（scriptArgs 是全局变量）----
const selfPath = scriptArgs[0];
const entry = join(dirname(selfPath), "test.js");
_load(entry);