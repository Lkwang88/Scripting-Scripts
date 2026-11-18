# Stash 面板

独立 Stash 覆写与脚本，不影响仓库中的 Egern 模块。

## 招商实时金价

[一键安装到 Stash](https://link.stash.ws/install-override/raw.githubusercontent.com/Lkwang88/Scripting-Scripts/main/Stash/Gold_Widgets.stoverride)

在 Stash 的覆写管理中，也可以通过 URL 安装：

```text
https://raw.githubusercontent.com/Lkwang88/Scripting-Scripts/main/Stash/Gold_Widgets.stoverride
```

安装并启用覆写后查看「招商金价」面板，桌面组件按 Stash 提供的面板选择入口设置。

- 显示买入、卖出（元/克）、涨跌及最后成功获取时间。
- 网络请求失败时使用24小时内的缓存，并明确标记 `⚠ 缓存` 和原获取时间。没有有效缓存则显示错误。
- 面板请求间隔为300秒（5分钟），脚本更新检查间隔为86400秒（1天）；不是保证桌面组件每5分钟刷新。
- 不增加代理、规则、MITM 或定时任务。

### 自定义参数

覆写中的 `argument` 是 JSON 字符串：

```yaml
argument: '{"TITLE":"招商金价","POLICY":""}'
```

- `TITLE`：面板标题。
- `POLICY`：留空遵循现有分流；`DIRECT` 显式直连，也可填已有策略组名。含特殊字符的值需要符合 JSON 转义规则。
- `tiles[0].interval`：面板刷新间隔，单位为秒。

参数直接写在覆写中，不依赖 Beta 参数表单；手工修改前建议保存备份，重新下载远程覆写可能覆盖本地修改。

### 验证与边界

脚本语法、32项模拟宿主回归测试、YAML 解析及真实招商接口响应验证通过。Stash 真机导入、面板截断和桌面刷新仍需用户验收；Node 模拟测试不替代宿主验证。

价格字段沿用原 Egern 脚本映射，不自行改变买卖视角；涨跌也沿用接口值，不额外推断周期或百分比。`更新` 时间是脚本本次获取时间，不是上游报价时间。

### 来源

- 原脚本：[Egern/Gold_Widgets.js](../Egern/Gold_Widgets.js)，原配置署名 IBL3ND。
- [面板](https://stash.wiki/script/tile) · [脚本接口](https://stash.wiki/script/syntax-and-interface) · [脚本管理](https://stash.wiki/script/manage-script) · [覆写](https://stash.wiki/configuration/override)
