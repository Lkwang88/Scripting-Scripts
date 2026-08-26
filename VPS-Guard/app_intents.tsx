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
        // 手动点了就该立刻有反馈：忽略退避，限 4 台、8s 预算
        const snap = await runRound(hosts, loadSnapshot(), settings, {
          limit: 4,
          budgetMs: 8000,
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
