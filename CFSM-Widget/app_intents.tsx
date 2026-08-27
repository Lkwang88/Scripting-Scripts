/**
 * CFSM Panel —— App Intent：小组件上的立即刷新按钮
 * RefreshCFSM：执行时重新拉取全站数据并重绘小组件。
 * Storage 与主 App / 小组件共享同一脚本域，数据落地后 reloadAll 即可。
 */
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchServers, loadSettings } from "./api"

const RefreshIntent = AppIntentManager.register({
  name: "RefreshCFSM",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    try {
      // fetchServers 成功即写快照缓存；失败走 catch（画缓存数据）
      await fetchServers(loadSettings())
    } catch {
      // 刷新失败也要重绘，展示上次数据
    }
    Widget.reloadAll()
  },
})

export { RefreshIntent }