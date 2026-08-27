# CFSM Panel

CF-Server-Monitor 多机在线面板小组件。一次请求拉全站监控，三类视图任意切换。

## 使用方法

1. 打开 `CFSM Panel` 脚本 → 填「面板地址」（如 `https://vps.example.com`）→ 保存
2. （私有站才需要）在「Bearer Token」填面板 JWT；公开站留空
3. 主屏添加小组件，选 `CFSM Panel`，参数（parameter）决定视图：

| parameter | 视图 |
|---|---|
| （留空） | 总览：● 在线状态 + CPU/内存条 + 全站吞吐（推荐） |
| `ping` | 三网延迟：电信 / 联通 / 移动，丢包或高延迟标橙 |
| `resources` | 资源：每台 CPU / 内存 / 磁盘三条占用 |

想要几块显示就添加几个小组件实例（如：一块总览 + 一块三网）。

## 设计要点

- 数据源：`GET /api/servers`（一次返回全部服务器 + 聚合统计，免鉴权访问公开站）
- 在线判定：`last_updated` 距今 ≤ 300s（CF 官方阈值）
- 布局自适应：Large ≤12 台带迷你条，>12 台紧凑；Medium 5 行；Small 红绿灯摘要
- 铁律：widget 内 fetch 5s 硬超时，失败降级 Storage 缓存渲染，绝不白屏
- 数据抓取时间显示在底部；降级时显示「缓存 x 分钟前」

## 刷新频率

WidgetKit 平台天花板 15~60 分钟一次。CFSM Agent 本身 60s 上报，适合"偶尔看一眼"的状态面板，不适合实时监控。