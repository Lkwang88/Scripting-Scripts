
const h = global.h
const mk = name => {
  const fn = (props = {}, ...children) => h(name, props, ...children)
  fn.__intrinsic = true
  return fn
}
const comps = ["VStack","HStack","ZStack","Text","Image","Circle","Capsule","Spacer",
  "Rectangle","RoundedRectangle","List","Section","Button","Menu","Toggle","TextField",
  "Picker","NavigationStack","NavigationLink","ScrollView","Divider","Label","Gauge",
  "ProgressView","LazyVStack","Grid","GridRow","Group","Link","EditButton","Stepper",
  "ContentUnavailableView","AccessoryWidgetBackground","GeometryReader","ForEach"]
const exportsObj = {}
for (const c of comps) exportsObj[c] = mk(c)
exportsObj.useState = init => [typeof init === "function" ? init() : init, () => {}]
exportsObj.useEffect = () => {}
exportsObj.useMemo = f => f()
exportsObj.useCallback = f => f
exportsObj.useReducer = (r, i) => [i, () => {}]
exportsObj.Navigation = { present: async () => {}, push: async () => {}, useDismiss: () => () => {} }
exportsObj.Widget = global.Widget
exportsObj.Script = global.Script
exportsObj.Dialog = {
  alert: async () => {}, confirm: async () => true,
  prompt: async () => null, actionSheet: async () => null,
}
exportsObj.AppIntentManager = { register: () => () => ({}) }
exportsObj.AppIntentProtocol = {}
exportsObj.modifiers = () => ({})
module.exports = exportsObj
