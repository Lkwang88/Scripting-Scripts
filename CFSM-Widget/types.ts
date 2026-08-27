/**
 * CFSM Panel —— CF-Server-Monitor 多机在线面板小组件
 * 数据类型定义（精简版：只保留挂件渲染需要的字段）
 */

export type WidgetMode = "overview" | "ping" | "resources"

/** 单台服务器精简模型（从 /api/servers 原始响应提取） */
export interface CfsmServer {
  id: string
  name: string
  region: string        // ISO 大写区域码：SG / US / JP ...
  online: boolean
  cpu: number           // 0-100（Agent 上报百分比）
  ramPct: number        // 0-100
  diskPct: number       // 0-100
  netIn: number         // B/s
  netOut: number        // B/s
  pingCt: number        // 电信延迟 ms
  pingCu: number        // 联通延迟 ms
  pingCm: number        // 移动延迟 ms
  lossCt: number        // 电信丢包 %
  lossCu: number        // 联通丢包 %
  lossCm: number        // 移动丢包 %
  lastUpdated: number   // epoch ms
}

/** 挂件渲染用的完整快照 */
export interface CfsmSnapshot {
  savedAt: number       // 数据抓取时间 epoch ms
  total: number
  online: number
  offline: number
  globalIn: number      // 全站下行 B/s
  globalOut: number     // 全站上行 B/s
  servers: CfsmServer[] // 已按 sort_order 排序
}

/** 设置（index.tsx 写，widget 读） */
export interface CfsmSettings {
  baseURL: string
  token?: string        // 可选 Bearer JWT（公开站留空即可）
}

/**
 * ShapeStyle 颜色字面量联合。真机不认宽泛 string（只认具体颜色）
 * —— 必须返回联合类型，UI 各处不要各写一套。
 */
export type PanelColor = "systemGreen" | "systemRed" | "systemOrange"