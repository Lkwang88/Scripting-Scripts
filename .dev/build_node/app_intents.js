"use strict";
/**
 * 小组件的交互意图（AppIntent 必须定义在本文件，Script.env === "app_intents"）。
 *
 * RefreshVPSGuard：面板上的刷新按钮 —— 立即探一轮并重绘小组件。
 * Storage 与主 App 共享同一脚本域，探测结果落快照后 reloadAll 即可。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshIntent = void 0;
const scripting_1 = require("scripting");
const store_1 = require("./store");
const probe_1 = require("./probe");
const RefreshIntent = scripting_1.AppIntentManager.register({
    name: "RefreshVPSGuard",
    protocol: scripting_1.AppIntentProtocol.AppIntent,
    perform: async (_params) => {
        try {
            const settings = (0, store_1.loadSettings)();
            const hosts = (0, store_1.loadHosts)();
            if (hosts.length > 0) {
                // 手动点了就该立刻有反馈：忽略退避，限 4 台、8s 预算
                const snap = await (0, probe_1.runRound)(hosts, (0, store_1.loadSnapshot)(), settings, {
                    limit: 4,
                    budgetMs: 8000,
                    force: true,
                });
                (0, store_1.saveSnapshot)(snap);
            }
        }
        catch {
            // 探测失败也要刷新界面（显示上次数据）
        }
        scripting_1.Widget.reloadAll();
    },
});
exports.RefreshIntent = RefreshIntent;
