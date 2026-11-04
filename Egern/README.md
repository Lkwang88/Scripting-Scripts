# Egern 专属小组件模块集合

适用于 [Egern](https://egernapp.com/) 的精选小组件与实用模块。通过 Egern 原生模块规范构建，支持在 UI 设置中图形化填写环境变量，零代码侵入。

---

## 模块列表

### 1. CF 探针·延迟流量 (`CF_Server_Monitor_Net_Widget.yaml`)
CF-Server-Monitor 专用多节点在线与网络质量监控小组件（NextGen 架构版）。
* **功能特性**：
  * **三网延迟精准对齐**：独立轨道舱（Cell Stack）布局，电信、联通、移动延迟绝对右对齐，消灭锯齿。
  * **月流量微胶囊进度条**：直观展示已用流量与限额百分比。
  * **符合 Apple HIG 预算机制**：采用标准 `PT15M`（15 分钟）黄金刷新，24 小时均匀在线，破除 iOS 中午断刷限制。
  * **5 秒硬超时 + 缓存降级**：绝不卡死、绝不白屏。
* **Egern 一键安装链接**：
  ```text
  https://raw.githubusercontent.com/Lkwang88/Scripting-Scripts/main/Egern/CF_Server_Monitor_Net_Widget.yaml
  ```
* **可配置环境变量（UI 自动生成）**：
  * `CFSM_URL`: 面板根地址（如 `https://monitor.example.com`）
  * `CFSM_USER`: 后台管理员账号
  * `CFSM_PASS`: 后台密码（如需显示隐藏服务器或私有面板）
  * `REFRESH_MINUTES`: 刷新时间（默认 15 分钟）
  * `SERVERS`: 筛选指定服务器（逗号分隔）

---

### 2. 招商实时金价 (`Gold_Widgets.yaml`)
招商银行实时黄金价格小组件（深浅色自适应）。
* **功能特性**：
  * 实时抓取招行公开行情，显示买入价、卖出价、当日涨跌幅度及时间戳。
  * 完美支持 iOS 小尺寸（Small）与中尺寸（Medium）。
  * 增强支持通过模块 UI 自定义标题、刷新间隔及请求策略。
* **Egern 一键安装链接**：
  ```text
  https://raw.githubusercontent.com/Lkwang88/Scripting-Scripts/main/Egern/Gold_Widgets.yaml
  ```
* **可配置环境变量（UI 自动生成）**：
  * `TITLE`: 自定义小组件标题（默认 `招商金价`）
  * `REFRESH_MINUTES`: 刷新时间（默认 5 分钟）
  * `POLICY`: 指定代理策略组（国内直连留空）

---

## 安装方法

1. 打开 **Egern** App；
2. 进入 **「工具」** -> **「模块」**；
3. 点击右上角 **`+`**，选择 **「从 URL 安装」**；
4. 粘贴上方对应的 `yaml` Raw 链接即可一键安装；
5. 进入已安装的模块详情页，即可直接在图形化表单中修改各项参数。
