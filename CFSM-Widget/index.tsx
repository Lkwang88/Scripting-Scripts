/**
 * CFSM Panel —— 设置页
 * 配置面板地址（必填）与 Bearer Token（可选：公开站留空，私有站填 JWT）。
 * 打开这个脚本即可看到页面，保存后添加/更新小组件。
 */
import {
  Button,
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
  const [testMsg, setTestMsg] = useState("")
  const [testOk, setTestOk] = useState(false)

  const save = () => {
    saveSettings({ baseURL, token })
    // 保存即退出：编辑完成直接回主屏，无需确认弹窗
    Script.exit()
  }

  const test = async () => {
    if (!baseURL.trim()) {
      setTestMsg("请先填写面板地址")
      setTestOk(false)
      return
    }
    setTesting(true)
    setTestMsg("测试中…")
    try {
      const snap = await fetchServers({ baseURL, token })
      setTestMsg(`成功：面板 ${snap.total} 台，在线 ${snap.online}，离线 ${snap.offline}`)
      setTestOk(true)
    } catch (e) {
      setTestMsg(`失败：${e instanceof Error ? e.message : String(e)}`)
      setTestOk(false)
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
              action={save}
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
            总览（推荐）：国旗 + 名字 + 三网延迟（电/联/移）+ 总流量
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
          {testMsg ? (
            <Text
              font="footnote"
              foregroundStyle={testOk ? "systemGreen" : "systemRed"}
              multilineTextAlignment="leading"
            >
              {testMsg}
            </Text>
          ) : null}
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