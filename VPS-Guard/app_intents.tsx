/**
 * 小组件的交互意图（AppIntent 必须定义在本文件，Script.env === "app_intents"）。
 *
 * RefreshVPSGuard：面板上的刷新按钮 —— 立即探一轮并重绘小组件。
 * Storage 与主 App 共享同一脚本域，探测结果落快照后 reloadAll 即可。
 */

import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { loadHosts, loadSettings, loadSnapshot, saveSnapshot } from "./store"
import { runRound } from "./probe"

const RefreshIntent = AppIntentManager.register({
  name: "RefreshVPSGuard",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    try {
      const settings = loadSettings()
      const hosts = loadHosts()
      if (hosts.length > 0) {
        // 手动点了就该有实质反馈。iOS 给 AppIntent 的执行窗口比小组件
        // 渲染宽裕得多：11 台实测 20s 预算能覆盖（每台 ICMP 档在无 Shell
        // 环境零成本跳过，HTTP 档快速失败为主）
        const snap = await runRound(hosts, loadSnapshot(), settings, {
          limit: 30,
          budgetMs: 20_000,
          force: true,
        })
        saveSnapshot(snap)
      }
    } catch {
      // 探测失败也要刷新界面（显示上次数据）
    }
    Widget.reloadAll()
  },
})

export { RefreshIntent }
