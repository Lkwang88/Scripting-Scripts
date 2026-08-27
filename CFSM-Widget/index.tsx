/**
 * CFSM Panel —— 设置页
 * 配置面板地址（必填）与 Bearer Token（可选：公开站留空，私有站填 JWT）。
 * 打开这个脚本即可看到页面，保存后添加/更新小组件。
 */
import {
  Button,
  Dialog,
  List,
  Navigation,
  NavigationStack,
  Script,
  Section,
  Text,
  TextField,
  useState,
} from "scripting"

import { fetchServers, loadSettings, saveSettings } from "./api"

function SettingsPage() {
  const initial = loadSettings()
  const [baseURL, setBaseURL] = useState(initial.baseURL)
  const [token, setToken] = useState(initial.token ?? "")
  const [testing, setTesting] = useState(false)

  const save = () => {
    saveSettings({ baseURL, token })
    return true
  }

  const test = async () => {
    if (!baseURL.trim()) {
      Dialog.alert({ title: "请先填写面板地址", message: "例如 https://vps.example.com" })
      return
    }
    setTesting(true)
    try {
      const snap = await fetchServers({ baseURL, token })
      Dialog.alert({
        title: "连接成功",
        message: `面板：${snap.total} 台机器，在线 ${snap.online}，离线 ${snap.offline}。`,
      })
    } catch (e) {
      Dialog.alert({ title: "连接失败", message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="CFSM Panel"
        navigationBarTitleDisplayMode="inline"
        listStyle="insetGrouped"
        toolbar={{
          confirmationAction: [
            <Button
              key="s"
              title="保存"
              action={() => {
                save()
                Dialog.alert({ title: "已保存", message: "回到桌面，更新小组件即可生效。" })
              }}
            />,
          ],
        }}
      >
        <Section
          header={<Text>面板设置</Text>}
          footer={
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              面板地址必填（CF-Server-Monitor 的访问域名，不含末尾斜杠）。
            </Text>
          }
        >
          <TextField
            title="面板地址"
            value={baseURL}
            onChanged={setBaseURL}
            prompt="https://vps.example.com"
          />
          <TextField
            title="Bearer Token（可选）"
            value={token}
            onChanged={setToken}
            prompt="公开站留空；私有站填 eyJ..."
          />
        </Section>

        <Section
          header={<Text>小组件模式</Text>}
          footer={
            <Text font="caption2" foregroundStyle="tertiaryLabel">
              添加小组件时在参数（parameter）里填：留空 = 总览面板；ping = 三网延迟；
              resources = 资源占用。想要几块就添加几个实例。
            </Text>
          }
        >
          <Text font="footnote" foregroundStyle="label">
            总览（推荐）：● 在线状态 + CPU/内存条 + 吞吐
          </Text>
          <Text font="footnote" foregroundStyle="label">
            ping：电信 / 联通 / 移动三网延迟，丢包标橙
          </Text>
          <Text font="footnote" foregroundStyle="label">
            resources：CPU / 内存 / 磁盘三条占用
          </Text>
        </Section>

        <Section header={<Text>连接测试</Text>}>
          <Button
            title={testing ? "测试中…" : "测试连接"}
            disabled={testing}
            action={test}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present({ element: <SettingsPage /> })
  Script.exit()
}

run()