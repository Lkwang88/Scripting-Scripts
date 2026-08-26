# ═══════════════════════════════════════════════════════════════
# 轻量测试构建 v2
# 用 esbuild（Go 二进制，内存 <50MB）把 4 个 TS 源逐个转译成
# CommonJS 到 build/VPS-Guard/（产物与 tsc 等价），然后 node 单
# 进程跑 test.js。彻底告别 tsc 编译 → 告别几百 MB 虚拟内存。
#
# 用法：sh run_test.sh
# 类型检查是另一条低频率路径（tsc --noEmit），与测试解耦。
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

mkdir -p build/VPS-Guard

echo "── esbuild 转译 TS → CJS ──"
for f in types store format probe; do
  esbuild "../VPS-Guard/$f.ts" --format=cjs --outfile="build/VPS-Guard/$f.js" --log-level=warning
done

echo "── node 单进程跑测试 ──"
node --max-old-space-size=128 test.js