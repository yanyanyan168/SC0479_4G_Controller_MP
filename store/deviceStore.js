/**
 * SC0479 小程序 V2.0 全局状态。
 *
 * 设计原则：
 * 1. 所有设备运行状态按 dev_id 隔离；
 * 2. 页面只读取 currentDeviceId 对应的状态别名；
 * 3. MCU ACK和主动上报才是最终状态来源；
 * 4. 本地缓存只用于切换页面时快速显示，不替代设备真实状态。
 */
import { reactive } from 'vue'
import {
  CHANNELS,
  DEBUG_ACK_TIMEOUT_MS,
  DEBUG_CONNECT_TIMEOUT_MS,
  DEFAULT_TOPIC_ROOT,
  DEFAULT_WS_URL,
  HEARTBEAT_INTERVAL_SEC,
  INTERMITTENT_LIMITS,
  MAX_PERIODS_PER_TASK,
  OFFLINE_TIMEOUT_SEC,
  USER_ACK_TIMEOUT_MS,
  USER_CONNECT_TIMEOUT_MS,
  buildTopicMap
} from '@/common/constants.js'

const SETTINGS_KEY = 'sc0479_v2_settings'
const DEVICES_KEY = 'sc0479_v2_devices'
const CURRENT_DEVICE_KEY = 'sc0479_v2_current_device'
const DEVICE_CACHE_KEY = 'sc0479_v2_device_cache'
const UI_KEY = 'sc0479_v2_ui'

let persistTimer = null

function createOutputState() {
  const result = {}
  CHANNELS.forEach((channel) => {
    result[channel] = {
      enabled: channel === 'dc12v',
      rawLevel: channel === 'dc12v' ? 1 : 0,
      controlMode: 'unknown',
      manualHold: false
    }
  })
  return result
}

function createTask(channel) {
  return {
    channel,
    configured: false,
    enable: false,
    active: false,
    repeat: [],
    periods: []
  }
}

function createTaskState() {
  const result = {}
  CHANNELS.forEach((channel) => { result[channel] = createTask(channel) })
  return result
}

function createIntermittentState() {
  return {
    enable: false,
    period_min: INTERMITTENT_LIMITS.periodMin.defaultValue,
    count: INTERMITTENT_LIMITS.count.defaultValue,
    duration_sec: INTERMITTENT_LIMITS.durationSec.defaultValue,
    active_channels: []
  }
}

function createRuntime() {
  return {
    online: false,
    lastSeenTs: 0,
    signal: 0,
    mqttConnected: false,
    fwVer: '',
    uptimeSec: 0,
    rtcOk: false,
    outputs: createOutputState(),
    tasks: createTaskState(),
    intermittent: createIntermittentState(),
    lastEvent: null,
    lastError: '',
    lastAckMessage: ''
  }
}

function normalizeDevice(item, index) {
  const source = item || {}
  const devId = String(source.devId || source.dev_id || source.id || '').trim()
  const order = Number(source.order || 0) > 0 ? Number(source.order) : index + 1
  return {
    devId,
    order,
    name: String(source.name || '').trim(),
    online: !!source.online,
    lastSeenTs: Number(source.lastSeenTs || 0)
  }
}

function normalizePeriod(item) {
  return {
    start: String(item && (item.start || item.start_time) || ''),
    end: String(item && (item.end || item.end_time) || '')
  }
}

function normalizeTask(item, fallbackChannel) {
  const source = item || {}
  const channel = source.channel || fallbackChannel
  return {
    channel,
    configured: typeof source.configured === 'boolean' ? source.configured : !!(source.periods && source.periods.length),
    enable: !!source.enable,
    active: !!source.active,
    repeat: Array.isArray(source.repeat)
      ? source.repeat.map(Number).filter((value) => value >= 1 && value <= 7)
      : [],
    periods: Array.isArray(source.periods)
      ? source.periods.slice(0, MAX_PERIODS_PER_TASK).map(normalizePeriod)
      : []
  }
}

function normalizeIntermittent(data) {
  const source = data || {}
  return {
    enable: !!source.enable,
    period_min: Number(source.period_min || INTERMITTENT_LIMITS.periodMin.defaultValue),
    count: Number(source.count || INTERMITTENT_LIMITS.count.defaultValue),
    duration_sec: Number(source.duration_sec || INTERMITTENT_LIMITS.durationSec.defaultValue),
    active_channels: Array.isArray(source.active_channels)
      ? source.active_channels.filter((channel) => channel === 'ds1' || channel === 'ds2')
      : []
  }
}

const state = reactive({
  settings: {
    wsUrl: DEFAULT_WS_URL,
    topicRoot: DEFAULT_TOPIC_ROOT
  },
  ui: {
    debugMode: false,
    ackTimeoutMs: DEBUG_ACK_TIMEOUT_MS,
    connectTimeoutMs: DEBUG_CONNECT_TIMEOUT_MS
  },
  mqtt: {
    connected: false,
    statusText: '未连接',
    lastError: '',
    brokerReady: false,
    mockMode: false
  },
  devices: [],
  currentDeviceId: '',
  deviceStates: {},

  /* 以下为当前设备快捷别名，切换设备时统一更新。 */
  device: createRuntime(),
  outputs: createOutputState(),
  tasks: createTaskState(),
  intermittent: createIntermittentState(),

  action: {
    status: 'idle',
    cmd: '',
    devId: '',
    seq: 0,
    message: '',
    updatedAt: 0
  },
  pendingSeqList: [],
  logs: []
})

function getDeviceIndex(devId) {
  return state.devices.findIndex((item) => item.devId === devId)
}

function ensureRuntime(devId) {
  if (!devId) return createRuntime()
  if (!state.deviceStates[devId]) state.deviceStates[devId] = createRuntime()
  return state.deviceStates[devId]
}

function syncCurrentAliases() {
  const runtime = ensureRuntime(state.currentDeviceId)
  state.device = runtime
  state.outputs = runtime.outputs
  state.tasks = runtime.tasks
  state.intermittent = runtime.intermittent
}

function updateDeviceSummary(devId) {
  const index = getDeviceIndex(devId)
  if (index < 0) return
  const runtime = ensureRuntime(devId)
  state.devices[index].online = !!runtime.online
  state.devices[index].lastSeenTs = Number(runtime.lastSeenTs || 0)
}

function serializeRuntime(runtime) {
  return {
    online: false,
    lastSeenTs: Number(runtime.lastSeenTs || 0),
    signal: Number(runtime.signal || 0),
    mqttConnected: !!runtime.mqttConnected,
    fwVer: String(runtime.fwVer || ''),
    uptimeSec: Number(runtime.uptimeSec || 0),
    rtcOk: !!runtime.rtcOk,
    outputs: runtime.outputs,
    tasks: runtime.tasks,
    intermittent: runtime.intermittent,
    lastEvent: runtime.lastEvent,
    lastError: String(runtime.lastError || '')
  }
}

function persistNow() {
  try {
    uni.setStorageSync(SETTINGS_KEY, state.settings)
    uni.setStorageSync(DEVICES_KEY, state.devices.map((item) => ({ devId: item.devId, name: item.name, order: item.order })))
    uni.setStorageSync(CURRENT_DEVICE_KEY, state.currentDeviceId)
    uni.setStorageSync(UI_KEY, state.ui)
    const cache = {}
    Object.keys(state.deviceStates).forEach((devId) => { cache[devId] = serializeRuntime(state.deviceStates[devId]) })
    uni.setStorageSync(DEVICE_CACHE_KEY, cache)
  } catch (error) {
    // 本地缓存失败不应中断实时控制，只记录调试日志。
    pushLog({ direction: 'sys', cmd: 'storage', result: 'error', payloadText: String(error && error.message || error) })
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 150)
}

function pushLog(item) {
  state.logs.unshift({
    id: Date.now() + '_' + Math.random().toString(16).slice(2, 8),
    timeText: new Date().toLocaleString(),
    direction: item.direction || 'sys',
    topic: item.topic || '',
    cmd: item.cmd || '',
    seq: item.seq || '',
    devId: item.devId || '',
    result: item.result || '',
    payloadText: item.payloadText || ''
  })
  if (state.logs.length > 200) state.logs.length = 200
}

function markSeen(devId) {
  if (!devId) return
  const runtime = ensureRuntime(devId)
  runtime.lastSeenTs = Math.floor(Date.now() / 1000)
  runtime.online = true
  updateDeviceSummary(devId)
  if (devId === state.currentDeviceId) syncCurrentAliases()
  schedulePersist()
}

function applyOutputs(runtime, outputs) {
  if (!outputs) return
  if (Array.isArray(outputs)) {
    outputs.forEach((item) => {
      if (!item || CHANNELS.indexOf(item.channel) < 0) return
      runtime.outputs[item.channel] = {
        ...runtime.outputs[item.channel],
        enabled: !!item.enabled,
        rawLevel: Number(typeof item.raw_level !== 'undefined' ? item.raw_level : runtime.outputs[item.channel].rawLevel),
        controlMode: item.control_mode || runtime.outputs[item.channel].controlMode || 'unknown',
        manualHold: typeof item.manual_hold === 'boolean' ? item.manual_hold : runtime.outputs[item.channel].manualHold
      }
    })
    return
  }
  CHANNELS.forEach((channel) => {
    const item = outputs[channel]
    if (!item) return
    runtime.outputs[channel] = {
      ...runtime.outputs[channel],
      enabled: typeof item.enabled === 'boolean' ? item.enabled : runtime.outputs[channel].enabled,
      rawLevel: Number(typeof item.raw_level !== 'undefined' ? item.raw_level : runtime.outputs[channel].rawLevel),
      controlMode: item.control_mode || runtime.outputs[channel].controlMode || 'unknown',
      manualHold: typeof item.manual_hold === 'boolean' ? item.manual_hold : runtime.outputs[channel].manualHold
    }
  })
}

function applyTasks(runtime, tasks) {
  if (!tasks) return
  if (Array.isArray(tasks)) {
    tasks.forEach((item) => {
      if (!item || CHANNELS.indexOf(item.channel) < 0) return
      runtime.tasks[item.channel] = normalizeTask(item, item.channel)
    })
    return
  }
  CHANNELS.forEach((channel) => {
    if (!tasks[channel]) return
    runtime.tasks[channel] = {
      ...runtime.tasks[channel],
      ...normalizeTask({ ...runtime.tasks[channel], ...tasks[channel], channel }, channel)
    }
  })
}

function applyStatusData(devId, data) {
  if (!devId || !data) return
  const runtime = ensureRuntime(devId)
  applyOutputs(runtime, data.outputs)
  applyTasks(runtime, data.tasks)
  if (data.intermittent) runtime.intermittent = normalizeIntermittent(data.intermittent)
  if (data.device) {
    runtime.fwVer = data.device.fw_ver || runtime.fwVer
    runtime.uptimeSec = Number(data.device.uptime_sec || runtime.uptimeSec || 0)
  }
  if (data.network) runtime.signal = Number(data.network.signal || data.network.rssi || runtime.signal || 0)
  if (data.rtc && typeof data.rtc.ok === 'boolean') runtime.rtcOk = data.rtc.ok
  markSeen(devId)
}

function applyHeartbeatData(devId, data) {
  if (!devId || !data) return
  const runtime = ensureRuntime(devId)
  runtime.uptimeSec = Number(data.uptime_sec || runtime.uptimeSec || 0)
  runtime.signal = Number(data.signal || runtime.signal || 0)
  runtime.mqttConnected = typeof data.mqtt_connected === 'boolean' ? data.mqtt_connected : runtime.mqttConnected
  runtime.rtcOk = typeof data.rtc_ok === 'boolean' ? data.rtc_ok : runtime.rtcOk
  markSeen(devId)
}

function applyEventData(devId, data) {
  if (!devId || !data) return
  const runtime = ensureRuntime(devId)
  runtime.lastEvent = { ...data, receivedAt: Math.floor(Date.now() / 1000) }
  if (data.reason) runtime.lastError = String(data.reason)
  markSeen(devId)
}

function applyAckData(message) {
  if (!message) return
  const devId = message.dev_id
  const data = message.data || {}
  const runtime = ensureRuntime(devId)

  if (message.result === 'ok') {
    if (message.cmd === 'set_output_ack' && data.channel && CHANNELS.indexOf(data.channel) >= 0) {
      runtime.outputs[data.channel] = {
        ...runtime.outputs[data.channel],
        enabled: typeof data.enabled === 'boolean' ? data.enabled : runtime.outputs[data.channel].enabled,
        manualHold: typeof data.manual_hold === 'boolean' ? data.manual_hold : true,
        controlMode: data.control_mode || 'manual'
      }
    }
    if (message.cmd === 'set_outputs_ack') applyOutputs(runtime, data.outputs)
    if (message.cmd === 'resume_auto_ack') {
      const channels = data.all ? CHANNELS : (Array.isArray(data.channels) ? data.channels : [])
      channels.forEach((channel) => {
        if (runtime.outputs[channel]) {
          runtime.outputs[channel].manualHold = false
          runtime.outputs[channel].controlMode = 'default'
        }
      })
      if (data.outputs) applyOutputs(runtime, data.outputs)
    }
    if (message.cmd === 'get_tasks_ack') applyTasks(runtime, data.tasks)
    if (message.cmd === 'enable_task_ack' && data.channel && runtime.tasks[data.channel]) {
      runtime.tasks[data.channel].enable = !!data.enable
      runtime.tasks[data.channel].configured = true
    }
    if (message.cmd === 'delete_task_ack' && data.channel && runtime.tasks[data.channel]) {
      runtime.tasks[data.channel] = createTask(data.channel)
    }
    if (message.cmd === 'set_intermittent_ack' || message.cmd === 'get_intermittent_ack') {
      runtime.intermittent = normalizeIntermittent(data)
    }
  } else if (message.error) {
    runtime.lastError = message.error.message || String(message.error.code || '设备返回错误')
  }

  runtime.lastAckMessage = message.cmd + ' / ' + (message.result || '')
  markSeen(devId)
}

function loadCachedRuntime(devId, cache) {
  const runtime = createRuntime()
  const source = cache || {}
  runtime.lastSeenTs = Number(source.lastSeenTs || 0)
  runtime.signal = Number(source.signal || 0)
  runtime.mqttConnected = !!source.mqttConnected
  runtime.fwVer = String(source.fwVer || '')
  runtime.uptimeSec = Number(source.uptimeSec || 0)
  runtime.rtcOk = !!source.rtcOk
  applyOutputs(runtime, source.outputs)
  applyTasks(runtime, source.tasks)
  runtime.intermittent = normalizeIntermittent(source.intermittent)
  runtime.lastEvent = source.lastEvent || null
  runtime.lastError = String(source.lastError || '')
  runtime.online = false
  state.deviceStates[devId] = runtime
}

export const deviceStore = {
  state,

  loadSettings() {
    const settings = uni.getStorageSync(SETTINGS_KEY)
    const ui = uni.getStorageSync(UI_KEY)
    const savedDevices = uni.getStorageSync(DEVICES_KEY)
    const savedCurrent = uni.getStorageSync(CURRENT_DEVICE_KEY)
    const cache = uni.getStorageSync(DEVICE_CACHE_KEY)

    if (settings && typeof settings === 'object') {
      state.settings.wsUrl = String(settings.wsUrl || DEFAULT_WS_URL)
      state.settings.topicRoot = String(settings.topicRoot || DEFAULT_TOPIC_ROOT)
    }
    if (ui && typeof ui === 'object') {
      state.ui.debugMode = !!ui.debugMode
      state.ui.ackTimeoutMs = Number(ui.ackTimeoutMs || DEBUG_ACK_TIMEOUT_MS)
      state.ui.connectTimeoutMs = Number(ui.connectTimeoutMs || DEBUG_CONNECT_TIMEOUT_MS)
    }

    const list = Array.isArray(savedDevices)
      ? savedDevices
          .map(normalizeDevice)
          .filter((item) => item.devId && item.devId !== 'GW4G_FACTORY')
      : []

    /* V2.0正式界面默认无设备；历史GW4G_FACTORY在升级时自动移除。 */
    state.devices = list

    list.forEach((device) => loadCachedRuntime(device.devId, cache && cache[device.devId]))
    state.currentDeviceId = list.some((item) => item.devId === savedCurrent)
      ? savedCurrent
      : (list.length ? list[0].devId : '')
    syncCurrentAliases()
    state.devices.forEach((device) => updateDeviceSummary(device.devId))
    persistNow()
  },

  saveSettings(settings) {
    state.settings.wsUrl = String(settings.wsUrl || DEFAULT_WS_URL).trim() || DEFAULT_WS_URL
    state.settings.topicRoot = String(settings.topicRoot || DEFAULT_TOPIC_ROOT).trim() || DEFAULT_TOPIC_ROOT
    schedulePersist()
  },

  saveUiSettings(settings) {
    state.ui.debugMode = !!settings.debugMode
    state.ui.ackTimeoutMs = Number(settings.ackTimeoutMs || DEBUG_ACK_TIMEOUT_MS)
    state.ui.connectTimeoutMs = Number(settings.connectTimeoutMs || DEBUG_CONNECT_TIMEOUT_MS)
    schedulePersist()
  },

  getAckTimeoutMs() {
    return state.ui.debugMode ? Number(state.ui.ackTimeoutMs || DEBUG_ACK_TIMEOUT_MS) : USER_ACK_TIMEOUT_MS
  },

  getConnectTimeoutMs() {
    return state.ui.debugMode ? Number(state.ui.connectTimeoutMs || DEBUG_CONNECT_TIMEOUT_MS) : USER_CONNECT_TIMEOUT_MS
  },

  getCurrentDevice() {
    return state.devices.find((item) => item.devId === state.currentDeviceId) || null
  },

  getDevice(devId) {
    return state.devices.find((item) => item.devId === devId) || null
  },

  getRuntime(devId) {
    return ensureRuntime(devId)
  },

  addDevice(device) {
    const nextOrder = state.devices.reduce((maxValue, item) => {
      return Math.max(maxValue, Number(item.order || 0))
    }, 0) + 1
    const normalized = normalizeDevice({ ...device, order: nextOrder }, nextOrder - 1)
    const existing = this.getDevice(normalized.devId)
    if (existing) return { added: false, device: existing }
    state.devices.push(normalized)
    ensureRuntime(normalized.devId)
    state.currentDeviceId = normalized.devId
    syncCurrentAliases()
    schedulePersist()
    return { added: true, device: normalized }
  },

  renameDevice(devId, name) {
    const item = this.getDevice(devId)
    if (!item) return false
    item.name = String(name || '').trim() || item.name
    schedulePersist()
    return true
  },

  switchDevice(devId) {
    if (!this.getDevice(devId)) return false
    state.currentDeviceId = devId
    syncCurrentAliases()
    schedulePersist()
    pushLog({ direction: 'sys', cmd: 'switch_device', devId, result: 'ok', payloadText: '当前设备切换为 ' + devId })
    return true
  },

  removeDevice(devId) {
    const index = getDeviceIndex(devId)
    if (index < 0) return false
    state.devices.splice(index, 1)
    delete state.deviceStates[devId]
    if (state.currentDeviceId === devId) {
      state.currentDeviceId = state.devices.length ? state.devices[0].devId : ''
      syncCurrentAliases()
    }
    schedulePersist()
    return true
  },

  getAllSubscribeTopics() {
    const list = []
    state.devices.forEach((device) => {
      const topics = buildTopicMap(device.devId, state.settings.topicRoot)
      list.push({ topic: topics.ack, qos: 1, devId: device.devId })
      list.push({ topic: topics.status, qos: 0, devId: device.devId })
      list.push({ topic: topics.heartbeat, qos: 0, devId: device.devId })
      list.push({ topic: topics.event, qos: 1, devId: device.devId })
    })
    return list
  },

  setBrokerReady(ready) { state.mqtt.brokerReady = !!ready },
  setMockMode(enabled) { state.mqtt.mockMode = !!enabled },
  setMqttState(connected, statusText, lastError) {
    state.mqtt.connected = !!connected
    state.mqtt.statusText = statusText || (connected ? '已连接' : '未连接')
    state.mqtt.lastError = lastError || ''
  },

  markSeen,
  applyStatusData,
  applyHeartbeatData,
  applyEventData,
  applyAckData,

  refreshOnlineState(timeoutSec) {
    const timeout = Number(timeoutSec || OFFLINE_TIMEOUT_SEC)
    const now = Math.floor(Date.now() / 1000)
    state.devices.forEach((device) => {
      const runtime = ensureRuntime(device.devId)
      runtime.online = !!runtime.lastSeenTs && (now - runtime.lastSeenTs <= timeout)
      updateDeviceSummary(device.devId)
    })
    syncCurrentAliases()
  },

  setLocalOutputs(devId, outputs, manualHold) {
    const runtime = ensureRuntime(devId)
    ;(Array.isArray(outputs) ? outputs : []).forEach((item) => {
      if (!item || CHANNELS.indexOf(item.channel) < 0) return
      runtime.outputs[item.channel] = {
        ...runtime.outputs[item.channel],
        enabled: !!item.enabled,
        manualHold: typeof manualHold === 'boolean' ? manualHold : runtime.outputs[item.channel].manualHold,
        controlMode: typeof manualHold === 'boolean' && manualHold ? 'manual' : runtime.outputs[item.channel].controlMode
      }
    })
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  clearLocalManualHold(devId, channels) {
    const runtime = ensureRuntime(devId)
    const list = channels === true ? CHANNELS : (Array.isArray(channels) ? channels : [])
    list.forEach((channel) => {
      if (!runtime.outputs[channel]) return
      runtime.outputs[channel].manualHold = false
      if (runtime.outputs[channel].controlMode === 'manual') runtime.outputs[channel].controlMode = 'default'
    })
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  setLocalTask(devId, task) {
    if (!task || CHANNELS.indexOf(task.channel) < 0) return
    const runtime = ensureRuntime(devId)
    runtime.tasks[task.channel] = normalizeTask({ ...task, configured: true }, task.channel)
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  setLocalTaskEnabled(devId, channel, enable) {
    const runtime = ensureRuntime(devId)
    if (!runtime.tasks[channel]) return
    runtime.tasks[channel].configured = true
    runtime.tasks[channel].enable = !!enable
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  deleteLocalTask(devId, channel) {
    const runtime = ensureRuntime(devId)
    runtime.tasks[channel] = createTask(channel)
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  setLocalIntermittent(devId, config) {
    const runtime = ensureRuntime(devId)
    runtime.intermittent = normalizeIntermittent(config)
    if (devId === state.currentDeviceId) syncCurrentAliases()
    schedulePersist()
  },

  markCommandPending(payload, timeoutMs) {
    state.action = {
      status: 'pending',
      cmd: payload.cmd,
      devId: payload.dev_id,
      seq: payload.seq,
      message: '等待设备确认…',
      timeoutMs,
      updatedAt: Date.now()
    }
  },

  markCommandAck(message) {
    const ok = message && message.result === 'ok'
    state.action = {
      status: ok ? 'success' : 'error',
      cmd: message && message.cmd || '',
      devId: message && message.dev_id || '',
      seq: message && message.seq || 0,
      message: ok ? '操作完成' : (message && message.error && message.error.message || '设备返回错误'),
      updatedAt: Date.now()
    }
  },

  markCommandTimeout(item) {
    state.action = {
      status: 'timeout',
      cmd: item.cmd || '',
      devId: item.devId || '',
      seq: Number(item.seq || 0),
      message: '设备未响应，请稍后重试',
      updatedAt: Date.now()
    }
  },

  addPendingSeq(seq, cmd, meta) {
    state.pendingSeqList.unshift({
      seq: Number(seq),
      cmd: cmd || '',
      devId: meta && meta.devId || '',
      timeoutMs: meta && meta.timeoutMs || this.getAckTimeoutMs(),
      startedAt: Date.now()
    })
    if (state.pendingSeqList.length > 30) state.pendingSeqList.length = 30
  },

  removePendingSeq(seq, devId) {
    state.pendingSeqList = state.pendingSeqList.filter((item) => {
      if (Number(item.seq) !== Number(seq)) return true
      if (devId && item.devId && item.devId !== devId) return true
      return false
    })
  },

  pushLog,
  clearLogs() { state.logs = [] },

  getOnlineSummary() {
    return {
      total: state.devices.length,
      online: state.devices.filter((item) => item.online).length,
      offline: state.devices.filter((item) => !item.online).length
    }
  },

  getHeartbeatIntervalSec() { return HEARTBEAT_INTERVAL_SEC }
}
