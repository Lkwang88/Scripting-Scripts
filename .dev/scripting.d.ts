/**
 * 本地类型桩（不会打包进 Scripting 项目，只用于 tsc 静态检查）。
 *
 * 原则：这里只声明「官方文档里确认存在」的组件与属性。
 * 如果代码里用了没在这儿声明的属性，tsc 会报错 —— 这正是我们要的：
 * 防止凭印象编造 API。
 */

interface ScriptingVNode {
  readonly __brand_vnode: void
}

type VirtualNode = ScriptingVNode

// lib 只开了 ES2020，这些宿主全局要自己声明
declare function setTimeout(callback: (...args: any[]) => void, ms?: number): number
declare function clearTimeout(id: number): void

declare const console: {
  log: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

interface AbortSignal {
  readonly aborted: boolean
}

declare class AbortController {
  readonly signal: AbortSignal
  abort(): void
}

declare namespace JSX {
  type Element = ScriptingVNode
  interface ElementChildrenAttribute {
    children: {}
  }
  interface IntrinsicElements {}
  /** key 对所有元素都合法（文档里 ForEach / List 的例子都在用） */
  interface IntrinsicAttributes {
    key?: string | number
  }
  interface IntrinsicClassAttributes<T> {
    key?: string | number
  }
}

// ------------------------------------------------------------------ fetch

interface RequestInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  signal?: AbortSignal
  allowInsecureRequest?: boolean
  handleRedirect?: (req: any) => Promise<any | null>
  debugLabel?: string
}

interface Response {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  json(): Promise<any>
  text(): Promise<string>
}

declare function fetch(url: string, init?: RequestInit): Promise<Response>

// ------------------------------------------------------------------ Storage

declare namespace Storage {
  function get<T>(key: string, options?: { shared: boolean }): T | null
  function set<T>(key: string, value: T, options?: { shared: boolean }): boolean
  function remove(key: string, options?: { shared: boolean }): void
  function contains(key: string, options?: { shared: boolean }): boolean
}

// ------------------------------------------------------------------ Shell

declare namespace Shell {
  function run(
    command: string,
    options?: {
      cwd?: string
      timeout?: number
      env?: Record<string, string>
      queryParameters?: Record<string, string>
    },
  ): Promise<{
    output: string
    exitCode: number
    timedOut: boolean
    cancelled: boolean
  }>
}

// ------------------------------------------------------------------ Widget

type WidgetFamily =
  | "systemSmall"
  | "systemMedium"
  | "systemLarge"
  | "accessoryCircular"
  | "accessoryRectangular"

type WidgetReloadPolicy =
  | { policy: "atEnd" }
  | { policy: "after"; date: Date }

// ------------------------------------------------------------------ Script

// ------------------------------------------------------------------ Dialog

declare module "scripting" {
  export type VirtualNode = ScriptingVNode

  // ------------------------------------------------------ 基础类型
  // Color：文档 KeywordsColor 全集 + HEX/RGBA 模板（真机声明不接受裸 string）
  export type Color =
    | `#${string}`
    | `rgba(${string})`
    | "accentColor"
    | "systemRed" | "systemGreen" | "systemBlue" | "systemOrange" | "systemYellow"
    | "systemPink" | "systemPurple" | "systemTeal" | "systemIndigo"
    | "systemBrown" | "systemMint" | "systemCyan"
    | "systemGray" | "systemGray2" | "systemGray3" | "systemGray4"
    | "systemGray5" | "systemGray6"
    | "label" | "secondaryLabel" | "tertiaryLabel" | "quaternaryLabel"
    | "systemFill" | "secondarySystemFill" | "tertiarySystemFill"
    | "quaternarySystemFill"
    | "systemBackground" | "secondarySystemBackground" | "tertiarySystemBackground"
    | "systemGroupedBackground" | "secondarySystemGroupedBackground"
    | "tertiarySystemGroupedBackground"
    | "separator" | "opaqueSeparator"
    | "black" | "darkGray" | "lightGray" | "white" | "gray" | "red" | "green"
    | "blue" | "cyan" | "yellow" | "magenta" | "orange" | "purple" | "brown"
    | "clear"
  export type Material =
    | "ultraThinMaterial" | "thinMaterial" | "regularMaterial"
    | "thickMaterial" | "barMaterial"
  // 渐变等复杂样式以 object 兜底；裸 string 不再被接受（与真机一致）
  export type ShapeStyle = Color | Material | object
  export type DynamicShapeStyle = { light: ShapeStyle; dark: ShapeStyle }
  export type Alignment =
    | "center"
    | "top"
    | "bottom"
    | "leading"
    | "trailing"
    | "topLeading"
    | "topTrailing"
    | "bottomLeading"
    | "bottomTrailing"
  export type HorizontalAlignment = "leading" | "center" | "trailing"
  export type VerticalAlignment = "top" | "center" | "bottom"
  export type Font =
    | "largeTitle"
    | "title"
    | "title2"
    | "title3"
    | "headline"
    | "subheadline"
    | "body"
    | "callout"
    | "footnote"
    | "caption"
    | "caption2"
  export type FontWeight =
    | "ultraLight"
    | "thin"
    | "light"
    | "regular"
    | "medium"
    | "semibold"
    | "bold"
    | "heavy"
    | "black"
  export type FontDesign = "default" | "monospaced" | "rounded" | "serif"

  export type Shape =
    | "rect"
    | "circle"
    | "capsule"
    | "ellipse"
    | "buttonBorder"
    | "containerRelative"
    | { type: "rect"; cornerRadius: number; style?: "circular" | "continuous" }

  export type StrokeStyle = {
    lineWidth?: number
    lineCap?: "butt" | "round" | "square"
    lineJoin?: "bevel" | "miter" | "round"
    dash?: number[]
    dashPhase?: number
  }

  type Paddings = {
    horizontal?: number | true
    vertical?: number | true
    leading?: number | true
    trailing?: number | true
    top?: number | true
    bottom?: number | true
  }

  type FrameFixed = { width?: number; height?: number; alignment?: Alignment }
  type FrameFlexible = {
    alignment?: Alignment
    minWidth?: number
    minHeight?: number
    maxWidth?: number | "infinity"
    maxHeight?: number | "infinity"
    idealWidth?: number | "infinity"
    idealHeight?: number | "infinity"
  }

  /** 通用视图修饰符 —— 全部经文档核对 */
  export type CommonViewProps = {
    key?: string | number
    padding?: boolean | number | Paddings
    frame?: FrameFixed | FrameFlexible
    background?:
      | ShapeStyle
      | DynamicShapeStyle
      | { style: ShapeStyle | DynamicShapeStyle; shape: Shape }
      | VirtualNode
      | { content: VirtualNode; alignment: Alignment }
    foregroundStyle?:
      | ShapeStyle
      | DynamicShapeStyle
      | {
          primary: ShapeStyle | DynamicShapeStyle
          secondary: ShapeStyle | DynamicShapeStyle
          tertiary?: ShapeStyle | DynamicShapeStyle
        }
    opacity?: number
    clipShape?: Shape
    clipped?: boolean
    cornerRadius?: number
    overlay?:
      | VirtualNode
      | { content: VirtualNode; alignment?: Alignment }
    shadow?: { radius: number; color?: Color; x?: number; y?: number }
    border?: { style: ShapeStyle; width?: number }
    offset?: { x?: number; y?: number }
    rotationEffect?: {
      degrees: number
      anchor:
        | "center" | "top" | "bottom" | "leading" | "trailing"
        | "topLeading" | "topTrailing" | "bottomLeading" | "bottomTrailing"
        | { x: number; y: number }
    }
    scaleEffect?: number | { x?: number; y?: number; anchor?: Alignment }
    zIndex?: number
    /** Picker 选项标记值（文档要求 Picker 的每个子项带 tag） */
    tag?: string | number
    blur?: number
    mask?: VirtualNode
    hidden?: boolean
    disabled?: boolean
    fixedSize?: boolean | { horizontal: boolean; vertical: boolean }
    layoutPriority?: number
    onTapGesture?: () => void
    onAppear?: () => void
    onDisappear?: () => void
    contentShape?: Shape
    /** 小组件专用 */
    widgetBackground?:
      | ShapeStyle
      | DynamicShapeStyle
      | { style: ShapeStyle | DynamicShapeStyle; shape: Shape }
    widgetAccentable?: boolean
    widgetURL?: string
    containerBackground?:
      | ShapeStyle
      | DynamicShapeStyle
      | { style: ShapeStyle | DynamicShapeStyle; shape?: Shape }
    /** 导航 */
    navigationTitle?: string
    navigationBarTitleDisplayMode?: "automatic" | "large" | "inline"
    toolbar?: Record<string, VirtualNode | VirtualNode[]>
    /** 列表 */
    refreshable?: () => Promise<void>
    listStyle?:
      | "automatic"
      | "plain"
      | "grouped"
      | "inset"
      | "insetGrouped"
      | "sidebar"
    listRowInsets?: number | Paddings
    listRowBackground?: VirtualNode | ShapeStyle
    listRowSeparator?: "automatic" | "visible" | "hidden"
    listSectionSpacing?: number | "compact" | "default"
    scrollContentBackground?: "automatic" | "visible" | "hidden"
    trailingSwipeActions?: {
      allowsFullSwipe?: boolean
      actions: VirtualNode[]
    }
    leadingSwipeActions?: {
      allowsFullSwipe?: boolean
      actions: VirtualNode[]
    }
    /** 弹层 */
    sheet?: {
      isPresented: boolean
      onChanged: (v: boolean) => void
      content: VirtualNode
    }
    alert?: {
      isPresented: boolean
      onChanged: (v: boolean) => void
      title: string
      message?: VirtualNode
      actions: VirtualNode[]
    }
    presentationDragIndicator?: "automatic" | "visible" | "hidden"
    presentationDetents?: (number | "medium" | "large")[]
    /** 文本类 */
    font?: Font | number | { name: string; size: number }
    fontWeight?: FontWeight
    fontDesign?: FontDesign
    bold?: boolean
    italic?: boolean
    monospaced?: boolean
    monospacedDigit?: boolean
    lineLimit?: number | { min?: number; max: number }
    minScaleFactor?: number
    multilineTextAlignment?: "leading" | "center" | "trailing"
    tint?: ShapeStyle
    animation?: any
    modifiers?: any
  }

  type ChildNode =
    | VirtualNode
    | string
    | number
    | boolean
    | null
    | undefined
  type Children = {
    children?: ChildNode | ChildNode[] | (ChildNode | ChildNode[])[]
  }

  export type FunctionComponent<P> = (props: P) => VirtualNode

  // ------------------------------------------------------ 布局
  export const VStack: FunctionComponent<
    CommonViewProps & Children & { alignment?: HorizontalAlignment; spacing?: number }
  >
  export const HStack: FunctionComponent<
    CommonViewProps & Children & { alignment?: VerticalAlignment; spacing?: number }
  >
  export const ZStack: FunctionComponent<
    CommonViewProps & Children & { alignment?: Alignment }
  >
  export const LazyVStack: FunctionComponent<
    CommonViewProps & Children & { alignment?: HorizontalAlignment; spacing?: number }
  >
  export const Grid: FunctionComponent<
    CommonViewProps &
      Children & {
        alignment?: Alignment
        horizontalSpacing?: number
        verticalSpacing?: number
      }
  >
  export const GridRow: FunctionComponent<
    CommonViewProps & Children & { alignment?: VerticalAlignment }
  >
  export const Spacer: FunctionComponent<{ minLength?: number } & CommonViewProps>
  export const Divider: FunctionComponent<CommonViewProps>
  export const Group: FunctionComponent<CommonViewProps & Children>
  export const ScrollView: FunctionComponent<
    CommonViewProps & Children & { axes?: "horizontal" | "vertical" | "all" }
  >

  // ------------------------------------------------------ 文本 / 图形
  export const Text: FunctionComponent<
    CommonViewProps & {
      children?:
        | null
        | string
        | number
        | boolean
        | undefined
        | (string | number | boolean | null | undefined)[]
      attributedString?: string
    }
  >
  export const Label: FunctionComponent<
    CommonViewProps & { title: string; systemImage?: string }
  >
  export const Image: FunctionComponent<
    CommonViewProps & {
      systemName?: string
      filePath?: string
      resizable?: boolean
      scaleToFit?: boolean
      scaleToFill?: boolean
      imageScale?: "small" | "medium" | "large"
    }
  >
  export const Circle: FunctionComponent<
    CommonViewProps & {
      fill?: ShapeStyle | DynamicShapeStyle
      stroke?: ShapeStyle | { shapeStyle: ShapeStyle; strokeStyle: StrokeStyle }
      trim?: { from: number; to: number }
    }
  >
  export const Capsule: FunctionComponent<
    CommonViewProps & {
      fill?: ShapeStyle | DynamicShapeStyle
      stroke?: ShapeStyle | { shapeStyle: ShapeStyle; strokeStyle: StrokeStyle }
      trim?: { from: number; to: number }
    }
  >
  export const Rectangle: FunctionComponent<
    CommonViewProps & {
      fill?: ShapeStyle | DynamicShapeStyle
      stroke?: ShapeStyle | { shapeStyle: ShapeStyle; strokeStyle: StrokeStyle }
      trim?: { from: number; to: number }
    }
  >
  export const RoundedRectangle: FunctionComponent<
    CommonViewProps & {
      cornerRadius: number
      fill?: ShapeStyle | DynamicShapeStyle
      stroke?: ShapeStyle | { shapeStyle: ShapeStyle; strokeStyle: StrokeStyle }
      trim?: { from: number; to: number }
    }
  >
  export const AccessoryWidgetBackground: FunctionComponent<CommonViewProps>

  // ------------------------------------------------------ 控件
  export const Button: FunctionComponent<
    CommonViewProps &
      Children & {
        title?: string
        systemImage?: string
        role?: "destructive" | "cancel" | "close" | "confirm"
        action?: () => void
        intent?: any
        buttonStyle?:
          | "automatic"
          | "bordered"
          | "borderedProminent"
          | "borderless"
          | "plain"
      }
  >
  export const Toggle: FunctionComponent<
    CommonViewProps & {
      value: boolean
      onChanged?: (v: boolean) => void
      intent?: any
      title?: string
      systemImage?: string
    }
  >
  export const TextField: FunctionComponent<
    CommonViewProps & {
      title?: string
      label?: VirtualNode
      value: string
      onChanged: (v: string) => void
      prompt?: string
      axis?: "horizontal" | "vertical"
      autofocus?: boolean
      onFocus?: () => void
      onBlur?: () => void
      keyboardType?: string
      textFieldStyle?: "automatic" | "plain" | "roundedBorder" | "squareBorder"
    }
  >
  export const Picker: FunctionComponent<
    CommonViewProps &
      Children & {
        title?: string
        systemImage?: string
        label?: VirtualNode
        value: string | number
        onChanged: (v: any) => void
        pickerStyle?:
          | "automatic"
          | "inline"
          | "menu"
          | "navigationLink"
          | "palette"
          | "segmented"
          | "wheel"
      }
  >
  export const Slider: FunctionComponent<
    CommonViewProps & {
      value: number
      onChanged: (v: number) => void
      min?: number
      max?: number
      step?: number
      label?: VirtualNode
    }
  >
  export const Stepper: FunctionComponent<
    CommonViewProps & {
      title?: string
      value?: number
      onIncrement: () => void
      onDecrement: () => void
      label?: VirtualNode
    }
  >
  export const Gauge: FunctionComponent<
    CommonViewProps & {
      value: number
      min?: number
      max?: number
      label?: VirtualNode
      currentValueLabel?: VirtualNode
      gaugeStyle?:
        | "automatic"
        | "accessoryCircular"
        | "accessoryCircularCapacity"
        | "linearCapacity"
        | "accessoryLinear"
        | "accessoryLinearCapacity"
    }
  >
  export const ProgressView: FunctionComponent<
    CommonViewProps & { value?: number; total?: number; label?: VirtualNode }
  >
  export const EditButton: FunctionComponent<CommonViewProps>
  export const Menu: FunctionComponent<
    CommonViewProps & Children & { title?: string; systemImage?: string }
  >
  export const Link: FunctionComponent<CommonViewProps & Children & { url: string }>
  export const ContentUnavailableView: FunctionComponent<
    CommonViewProps & {
      title?: string
      systemImage?: string
      description?: VirtualNode
    }
  >

  // ------------------------------------------------------ 列表 / 导航
  export const List: FunctionComponent<CommonViewProps & Children>
  export const Section: FunctionComponent<
    CommonViewProps &
      Children & {
        header?: VirtualNode
        footer?: VirtualNode
        isExpanded?: boolean
        onChanged?: (v: boolean) => void
      }
  >
  export const ForEach: FunctionComponent<{
    count: number
    itemBuilder: (index: number) => VirtualNode
    onDelete?: (indices: number[]) => void
    onMove?: (indices: number[], newOffset: number) => void
  }>
  export const NavigationStack: FunctionComponent<CommonViewProps & Children>
  export const NavigationLink: FunctionComponent<
    CommonViewProps & Children & { title?: string; destination: VirtualNode }
  >
  export const GeometryReader: FunctionComponent<
    CommonViewProps & {
      children: (proxy: { size: { width: number; height: number } }) => VirtualNode
    }
  >

  // ------------------------------------------------------ Hooks / API
  export function useState<S>(initial: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void
  export function useMemo<T>(factory: () => T, deps?: any[]): T
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: any[]): T
  export function useReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initial: S,
  ): [S, (action: A) => void]

  export type WidgetFamily =
    | "systemSmall"
    | "systemMedium"
    | "systemLarge"
    | "accessoryCircular"
    | "accessoryRectangular"

  export type WidgetReloadPolicy =
    | { policy: "atEnd" }
    | { policy: "after"; date: Date }

  export const Widget: {
    family: WidgetFamily
    displaySize: { width: number; height: number }
    parameter: string
    present(
      element: VirtualNode,
      options?: WidgetReloadPolicy | { reloadPolicy?: WidgetReloadPolicy },
    ): void
    preview(options?: {
      family?: WidgetFamily
      parameters?: { options: Record<string, string>; default: string }
    }): Promise<void>
    reloadAll(): void
  }

  export const Script: {
    name: string
    directory: string
    env:
      | "index"
      | "widget"
      | "control_widget"
      | "notification"
      | "intent"
      | "app_intents"
      | "assistant_tool"
      | "keyboard"
      | "live_activity"
    widgetParameter: string
    queryParameters: Record<string, any>
    exit(result?: any): void
    createOpenURLScheme(name: string): string
    /** 脚本实例存活时从后台切回触发（官方 zh/guide Rime 文档确认） */
    onResume(callback: (details: { queryParameters: Record<string, any> }) => void): void
    /** 最小化当前脚本（不终止实例）。Promise 保持 pending 直到恢复 */
    minimize(): Promise<void>
    /** 当前环境是否支持最小化 */
    supportsMinimization(): boolean
  }

  export const Dialog: {
    alert(options: {
      message: string
      title?: string
      buttonLabel?: string
    }): Promise<void>
    confirm(options: {
      message: string
      title?: string
      cancelLabel?: string
      confirmLabel?: string
    }): Promise<boolean>
    prompt(options: {
      title: string
      message?: string
      defaultValue?: string
      placeholder?: string
      obscureText?: boolean
      selectAll?: boolean
      cancelLabel?: string
      confirmLabel?: string
      keyboardType?: string
    }): Promise<string | null>
    actionSheet(options: {
      title: string
      message?: string
      cancelButton?: boolean
      actions: { label: string; destructive?: boolean }[]
    }): Promise<number | null>
  }

  export const Navigation: {
    present(options: {
      element: VirtualNode
      modalPresentationStyle?: string
    }): Promise<any>
    push(options: { element: VirtualNode }): Promise<any>
    useDismiss(): (result?: any) => void
  }

  export const AppIntentManager: {
    register<P>(options: {
      name: string
      protocol: string
      perform: (params: P) => Promise<void>
    }): (params: P) => any
  }
  export const AppIntentProtocol: {
    AppIntent: string
    AudioPlaybackIntent: string
    AudioRecordingIntent: string
    LiveActivityIntent: string
  }

  export function modifiers(): any
}
