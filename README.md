# Scripting Scripts

自用的 [Scripting](https://scripting.fun/) 脚本项目集合。每个顶层目录是一个可直接导入的独立项目。

## 项目

| 项目 | 说明 |
|---|---|
| [VPS Guard](./VPS%20Guard) | VPS 在线状态红绿灯，主屏小组件 + 主 App 管理 |

## 目录约定

跟随官方 [ScriptingApp/scripts](https://github.com/ScriptingApp/scripts) 的结构：一个脚本项目 = 一个顶层目录，目录名与 `script.json` 的 `name` 保持一致。

```text
Scripting-Scripts/
├── README.md
├── .gitignore
├── .dev/                 # 桌面端开发辅助，不参与 App 同步
│   ├── scripting.d.ts    # 本地类型桩（防止凭印象编造 API）
│   ├── tsconfig.json     # 类型检查配置
│   ├── tsconfig.test.json
│   └── test.js           # 纯逻辑单元测试
└── VPS Guard/            # 一个脚本项目
    ├── script.json       # 官方必需：name / icon / color / version
    ├── index.tsx         # 官方必需：主入口
    ├── widget.tsx        # 可选入口：主屏小组件
    ├── *.ts              # 共用业务逻辑模块
    └── README.md
```

`script.json` 必须包含 `name`、`icon`、`color`、`version`；`name` 通常与目录名一致。只创建实际需要的入口文件，不预留用不到的 `intent.tsx` / `live_activity.tsx` 之类。

## 导入到 iPhone

三种方式，按场景选：

**一次性导入**——把 GitHub 目录 URL 贴到 [import_scripts](https://scripting.fun/import_scripts) 生成导入链接，在手机上打开：

```text
https://github.com/<owner>/<repo>/tree/main/VPS%20Guard
```

**远程同步（推荐，可自动更新）**——导入后在 App 里给项目配置远程资源。`script.json` 支持 `remoteResource` 字段，App 会按间隔自动拉取更新：

```json
{
  "remoteResource": {
    "url": "https://github.com/<owner>/<repo>/tree/main/VPS%20Guard",
    "autoUpdateInterval": 21600
  }
}
```

`autoUpdateInterval` 单位是秒，不设则不自动更新。`hash` 字段由 App 自己维护，不用手写。

**桌面实时联调**——开发期用 [`scripting-cli`](https://www.npmjs.com/package/scripting-cli)（需 Node.js 20+），手机 App 连上后双向同步，存盘即在手机上执行：

```bash
npx scripting-cli start --bonjour
```

连接后 App 会把当前版本的 `.d.ts` 声明同步进工作目录，那是确认 API 签名最准的依据。注意它默认排除 `.git` 和 `node_modules`，但敏感文件要自己在 `ignore` 里排掉。

## 开发校验

`.dev/` 里的东西只服务桌面端，不影响 App 运行。

```bash
cd .dev

# 类型检查（含所有项目）
npx tsc -p tsconfig.json --noEmit

# 单元测试（纯逻辑部分）
npx tsc -p tsconfig.test.json && node test.js
```

`scripting.d.ts` 是手写的类型桩，只声明官方文档确认存在的 API。它的作用是让「凭印象编造的属性名」变成编译错误——实践中确实抓出过十几处。它不是完整声明，缺什么补什么；真机联调后应优先信任 App 同步来的 `.d.ts`。

桌面端能验证的只有类型检查、单元测试和逻辑正确性。小组件渲染、Intent 调用、通知展开这些必须在真机宿主里确认。

## 参考

- [官方文档](https://scriptingapp.github.io/zh/) · [llms.txt 索引](https://scriptingapp.github.io/zh/llms.txt)
- [官方脚本示例](https://github.com/ScriptingApp/scripts) · [官方 Skills](https://github.com/ScriptingApp/skills)
- [开发规范 Skill](https://github.com/ScriptingApp/scripting-app-development)
