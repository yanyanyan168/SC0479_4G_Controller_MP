/**
 * 微信小程序原生 WebSocket MQTT 3.1.1 客户端。
 *
 * 业务约束：
 * - 一个MQTT长连接同时订阅所有已绑定设备；
 * - 命令只发送到payload.dev_id对应设备；
 * - ACK严格按 dev_id + seq + ack_cmd 匹配；
 * - 本文件不实现UART0、滚码或4G诊断功能。
 */
import {
  OFFLINE_TIMEOUT_SEC,
  PROTOCOL_VER,
  buildTopicMap
} from '@/common/constants.js'
import {
  makeMockEvent,
  makeMockHeartbeat,
  makeMockStatusReport
} from '@/common/mockMessages.js'
import { deviceStore } from '@/store/deviceStore.js'

let client = null
let onlineTimer = null
let pendingMap = {}
let nativeMqttReadyLogged = false
let reconnectTimer = null
let reconnectAttempt = 0
let manualDisconnect = false
let connectPromise = null
let connectTimer = null


function clearReconnectTimer() {
  if (!reconnectTimer) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function scheduleReconnect() {
  if (manualDisconnect || deviceStore.state.mqtt.mockMode || !deviceStore.state.devices.length) return
  if (reconnectTimer) return
  reconnectAttempt += 1
  const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(reconnectAttempt - 1, 3)))
  deviceStore.setMqttState(false, '等待自动重连', '')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    mqttClient.connect().catch(() => scheduleReconnect())
  }, delay)
}

function buildPayloadText(message) {
  return JSON.stringify(message, null, 2)
}

function ensureNativeMqttReady() {
  deviceStore.setBrokerReady(true)
  if (nativeMqttReadyLogged) return
  nativeMqttReadyLogged = true
  deviceStore.pushLog({
    direction: 'sys',
    cmd: 'mqtt_init',
    result: 'ok',
    payloadText: '使用微信小程序原生 WebSocket MQTT 客户端'
  })
}

function getTopics(devId) {
  return buildTopicMap(devId || deviceStore.state.currentDeviceId, deviceStore.state.settings.topicRoot)
}

function buildPendingKey(devId, seq, ackCmd) {
  return String(devId || '') + ':' + String(seq || '') + ':' + String(ackCmd || '')
}

function startOnlineGuard() {
  stopOnlineGuard()
  onlineTimer = setInterval(() => {
    deviceStore.refreshOnlineState(OFFLINE_TIMEOUT_SEC)
  }, 1000)
}

function stopOnlineGuard() {
  if (!onlineTimer) return
  clearInterval(onlineTimer)
  onlineTimer = null
}

function clearPending(key, isTimeout) {
  const item = pendingMap[key]
  if (!item) return
  clearTimeout(item.timer)
  delete pendingMap[key]
  deviceStore.removePendingSeq(item.seq, item.devId)

  if (!isTimeout) return
  deviceStore.markCommandTimeout(item)
  deviceStore.pushLog({
    direction: 'timeout',
    cmd: item.cmd,
    seq: item.seq,
    devId: item.devId,
    result: 'timeout',
    payloadText: 'ACK超时：' + Math.round(item.timeoutMs / 1000) + '秒'
  })
  if (typeof item.reject === 'function') item.reject(new Error('设备未响应'))
}

function registerPending(payload, resolve, reject) {
  const timeoutMs = deviceStore.getAckTimeoutMs()
  const devId = payload.dev_id
  const ackCmd = payload.cmd + '_ack'
  const key = buildPendingKey(devId, payload.seq, ackCmd)
  const item = {
    key,
    devId,
    seq: payload.seq,
    ackCmd,
    cmd: payload.cmd,
    payload,
    timeoutMs,
    resolve,
    reject,
    timer: null
  }
  item.timer = setTimeout(() => clearPending(key, true), timeoutMs)
  pendingMap[key] = item
  deviceStore.addPendingSeq(payload.seq, payload.cmd, { timeoutMs, devId })
  deviceStore.markCommandPending(payload, timeoutMs)
}

function handleAckMessage(message) {
  const devId = message.dev_id || ''
  const key = buildPendingKey(devId, message.seq, message.cmd)
  const pending = pendingMap[key]

  deviceStore.applyAckData(message)
  deviceStore.markCommandAck(message)

  if (!pending) return
  clearTimeout(pending.timer)
  delete pendingMap[key]
  deviceStore.removePendingSeq(message.seq, devId)

  if (message.result === 'ok') pending.resolve(message)
  else pending.reject(message)
}

function handleIncomingMessage(topic, payloadText) {
  let message
  try {
    message = JSON.parse(payloadText)
  } catch (error) {
    deviceStore.pushLog({ direction: 'rx', topic, cmd: 'parse_error', result: 'error', payloadText })
    return
  }

  const devId = message.dev_id || ''
  deviceStore.pushLog({
    direction: 'rx',
    topic,
    cmd: message.cmd,
    seq: message.seq,
    devId,
    result: message.result || '',
    payloadText
  })

  if (!devId) return
  if (message.cmd && /_ack$/.test(message.cmd)) {
    handleAckMessage(message)
    return
  }
  if (message.cmd === 'status_report') {
    deviceStore.applyStatusData(devId, message.data)
    return
  }
  if (message.cmd === 'heartbeat') {
    deviceStore.applyHeartbeatData(devId, message.data)
    return
  }
  if (message.cmd === 'event') {
    deviceStore.applyEventData(devId, message.data)
  }
}

function getLatestPending() {
  const items = Object.keys(pendingMap).map((key) => pendingMap[key])
  if (!items.length) return null
  return items.sort((a, b) => Number(b.seq) - Number(a.seq))[0]
}

function utf8Encode(text) {
  const bytes = []
  let i = 0
  let code = 0
  let next = 0

  text = String(text || '')

  for (i = 0; i < text.length; i++) {
    code = text.charCodeAt(i)

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        i++
      }
    }

    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    } else {
      bytes.push(0xf0 | (code >> 18))
      bytes.push(0x80 | ((code >> 12) & 0x3f))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    }
  }

  return bytes
}

function utf8Decode(bytes) {
  let result = ''
  let i = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let code = 0

  while (i < bytes.length) {
    b1 = bytes[i++]

    if (b1 < 0x80) {
      result += String.fromCharCode(b1)
    } else if (b1 >= 0xc0 && b1 < 0xe0 && i < bytes.length) {
      b2 = bytes[i++]
      result += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f))
    } else if (b1 >= 0xe0 && b1 < 0xf0 && i + 1 < bytes.length) {
      b2 = bytes[i++]
      b3 = bytes[i++]
      result += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f))
    } else if (b1 >= 0xf0 && i + 2 < bytes.length) {
      b2 = bytes[i++]
      b3 = bytes[i++]
      b4 = bytes[i++]
      code = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)
      code -= 0x10000
      result += String.fromCharCode(0xd800 + (code >> 10))
      result += String.fromCharCode(0xdc00 + (code & 0x3ff))
    }
  }

  return result
}

function encodeString(text) {
  const body = utf8Encode(text)
  const len = body.length
  return [len >> 8, len & 0xff].concat(body)
}

function encodeRemainingLength(length) {
  const encoded = []
  let digit = 0

  do {
    digit = length % 128
    length = Math.floor(length / 128)
    if (length > 0) {
      digit = digit | 0x80
    }
    encoded.push(digit)
  } while (length > 0)

  return encoded
}

function concatBytes(parts) {
  const out = []
  parts.forEach((part) => {
    let i = 0
    for (i = 0; i < part.length; i++) {
      out.push(part[i])
    }
  })
  return out
}

function toArrayBuffer(bytes) {
  const array = new Uint8Array(bytes.length)
  let i = 0
  for (i = 0; i < bytes.length; i++) {
    array[i] = bytes[i] & 0xff
  }
  return array.buffer
}

function bytesFromData(data) {
  if (data instanceof ArrayBuffer) {
    return Array.prototype.slice.call(new Uint8Array(data))
  }

  if (typeof data === 'string') {
    return utf8Encode(data)
  }

  if (data && data.byteLength !== undefined) {
    return Array.prototype.slice.call(new Uint8Array(data))
  }

  return []
}

function buildMqttPacket(typeAndFlags, variableAndPayload) {
  return [typeAndFlags].concat(encodeRemainingLength(variableAndPayload.length), variableAndPayload)
}

function createNativeMqttClient(wsUrl, options) {
  let socketTask = null
  let connected = false
  let manuallyClosed = false
  let packetId = 1
  let rxBuffer = []
  let pingTimer = null
  const handlers = {}

  function emit(name) {
    const args = Array.prototype.slice.call(arguments, 1)
    const list = handlers[name] || []
    list.slice().forEach((handler) => {
      handler.apply(null, args)
    })
  }

  function nextPacketId() {
    packetId += 1
    if (packetId > 65535) {
      packetId = 1
    }
    return packetId
  }

  function sendBytes(bytes, callback) {
    if (!socketTask) {
      if (callback) {
        callback(new Error('socket not ready'))
      }
      return
    }

    socketTask.send({
      data: toArrayBuffer(bytes),
      success() {
        if (callback) {
          callback()
        }
      },
      fail(error) {
        if (callback) {
          callback(new Error(error && error.errMsg ? error.errMsg : 'socket send failed'))
        }
      }
    })
  }

  function sendConnect() {
    const keepalive = options.keepalive || 60
    const clientId = options.clientId || ('MP_SC0479_' + Date.now())
    const variableHeader = []
      .concat(encodeString('MQTT'))
      .concat([4, 2, keepalive >> 8, keepalive & 0xff])
    const payload = encodeString(clientId)

    sendBytes(buildMqttPacket(0x10, variableHeader.concat(payload)))
  }

  function sendSubscribe(topic, qos) {
    const id = nextPacketId()
    const variableHeader = [id >> 8, id & 0xff]
    const payload = encodeString(topic).concat([qos || 0])
    sendBytes(buildMqttPacket(0x82, variableHeader.concat(payload)))
  }

  function sendPing() {
    if (connected) {
      sendBytes([0xc0, 0x00])
    }
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(sendPing, Math.max(15, options.keepalive || 60) * 1000)
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function readString(bytes, offset) {
    const len = (bytes[offset] << 8) | bytes[offset + 1]
    const start = offset + 2
    const end = start + len
    return {
      value: utf8Decode(bytes.slice(start, end)),
      next: end
    }
  }

  function handlePacket(packetType, flags, body) {
    let topicInfo = null
    let topic = ''
    let qos = 0
    let id = 0
    let offset = 0
    let payload = []

    if (packetType === 2) {
      if (body.length >= 2 && body[1] === 0) {
        connected = true
        startPing()
        emit('connect')
      } else {
        emit('error', new Error('MQTT CONNACK 失败，returnCode=' + (body[1] || 0)))
      }
      return
    }

    if (packetType === 3) {
      qos = (flags >> 1) & 0x03
      topicInfo = readString(body, 0)
      topic = topicInfo.value
      offset = topicInfo.next

      if (qos > 0) {
        id = (body[offset] << 8) | body[offset + 1]
        offset += 2
      }

      payload = body.slice(offset)
      emit('message', topic, utf8Decode(payload))

      if (qos === 1 && id > 0) {
        sendBytes([0x40, 0x02, id >> 8, id & 0xff])
      }
      return
    }

    if (packetType === 4 || packetType === 9 || packetType === 13) {
      return
    }

    if (packetType === 14) {
      connected = false
      stopPing()
      emit('close')
    }
  }

  function parseIncoming(bytes) {
    let offset = 0
    let first = 0
    let multiplier = 1
    let remainingLength = 0
    let digit = 0
    let headerStart = 0
    let bodyStart = 0
    let packetEnd = 0

    rxBuffer = rxBuffer.concat(bytes)

    while (rxBuffer.length >= 2) {
      headerStart = 0
      first = rxBuffer[headerStart]
      offset = 1
      multiplier = 1
      remainingLength = 0

      do {
        if (offset >= rxBuffer.length) {
          return
        }
        digit = rxBuffer[offset++]
        remainingLength += (digit & 0x7f) * multiplier
        multiplier *= 128
      } while ((digit & 0x80) !== 0)

      bodyStart = offset
      packetEnd = bodyStart + remainingLength
      if (rxBuffer.length < packetEnd) {
        return
      }

      handlePacket(first >> 4, first & 0x0f, rxBuffer.slice(bodyStart, packetEnd))
      rxBuffer = rxBuffer.slice(packetEnd)
    }
  }

  return {
    connected: false,

    on(name, handler) {
      if (!handlers[name]) {
        handlers[name] = []
      }
      handlers[name].push(handler)
    },

    connect() {
      manuallyClosed = false

      // 【重要】微信小程序真机必须使用 wss:// 加密协议，URL 必须以 wss:// 开头
      // 确保 wsUrl 已经是 wss:// 格式，否则自动转换
      const safeUrl = String(wsUrl || '').replace(/^ws:\/\//i, 'wss://')
      
      socketTask = uni.connectSocket({
        url: safeUrl,
        protocols: ['mqtt'],
        success() {},
        fail(error) {
          emit('error', new Error(error && error.errMsg ? error.errMsg : 'connectSocket failed'))
        }
      })

      socketTask.onOpen(() => {
        sendConnect()
      })

      socketTask.onMessage((event) => {
        parseIncoming(bytesFromData(event.data))
      })

      socketTask.onError((error) => {
        connected = false
        stopPing()
        emit('error', new Error(error && error.errMsg ? error.errMsg : 'WebSocket error'))
      })

      socketTask.onClose(() => {
        connected = false
        stopPing()
        emit('close')
        if (!manuallyClosed) {
          emit('offline')
        }
      })
    },

    subscribe(topic, opts) {
      sendSubscribe(topic, opts && opts.qos ? opts.qos : 0)
    },

    publish(topic, payloadText, opts, callback) {
      const qos = opts && opts.qos ? opts.qos : 0
      const retain = opts && opts.retain ? 1 : 0
      const id = qos > 0 ? nextPacketId() : 0
      const header = 0x30 | (qos << 1) | retain
      let body = encodeString(topic)
      if (qos > 0) {
        body = body.concat([id >> 8, id & 0xff])
      }
      body = body.concat(utf8Encode(payloadText))
      sendBytes(buildMqttPacket(header, body), callback)
    },

    end(force) {
      manuallyClosed = true
      connected = false
      stopPing()
      if (socketTask) {
        if (!force) {
          sendBytes([0xe0, 0x00])
        }
        socketTask.close({})
        socketTask = null
      }
    },

    isConnected() {
      return connected
    },

    markConnectedToPublicState() {
      this.connected = connected
    }
  }
}


function subscribeTopics() {
  if (!client || !client.isConnected()) return
  const items = deviceStore.getAllSubscribeTopics()
  items.forEach((item) => client.subscribe(item.topic, { qos: item.qos }))
  deviceStore.pushLog({
    direction: 'sys',
    cmd: 'mqtt_subscribe_all',
    result: 'ok',
    payloadText: '已订阅' + items.length + '个Topic，设备数：' + deviceStore.state.devices.length
  })
}

function publishPayload(payload, resolve, reject) {
  const topics = getTopics(payload.dev_id)
  const payloadText = buildPayloadText(payload)
  registerPending(payload, resolve, reject)
  deviceStore.pushLog({
    direction: 'tx',
    topic: topics.cmd,
    cmd: payload.cmd,
    seq: payload.seq,
    devId: payload.dev_id,
    result: 'pending',
    payloadText
  })
  client.publish(topics.cmd, payloadText, { qos: 1, retain: false }, (error) => {
    if (!error) return
    clearPending(buildPendingKey(payload.dev_id, payload.seq, payload.cmd + '_ack'), false)
    reject(error)
  })
}

export const mqttClient = {
  bootstrap() {
    ensureNativeMqttReady()
    startOnlineGuard()
  },

  isConnected() {
    return !!(client && client.isConnected())
  },

  connect() {
    ensureNativeMqttReady()
    manualDisconnect = false
    clearReconnectTimer()
    if (deviceStore.state.mqtt.mockMode) deviceStore.setMockMode(false)
    if (client && client.isConnected()) {
      subscribeTopics()
      return Promise.resolve()
    }
    if (connectPromise) return connectPromise

    const settings = deviceStore.state.settings
    connectPromise = new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        if (connectTimer) {
          clearTimeout(connectTimer)
          connectTimer = null
        }
        connectPromise = null
      }
      
      connectTimer = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        deviceStore.setMqttState(false, '连接超时', 'MQTT CONNACK 超时')
        if (client) client.end(true)
        client = null
        reject(new Error('连接超时'))
        scheduleReconnect()
      }, deviceStore.getConnectTimeoutMs())

      client = createNativeMqttClient(settings.wsUrl, {
        clientId: 'MP_SC0479_V2_' + Date.now(),
        keepalive: 60
      })

      client.on('connect', () => {
        clearTimeout(connectTimer)
        connectTimer = null
        reconnectAttempt = 0
        deviceStore.setMqttState(true, '已连接', '')
        deviceStore.pushLog({ direction: 'sys', cmd: 'mqtt_connect', result: 'ok', payloadText: settings.wsUrl })
        subscribeTopics()
        if (!settled) {
          settled = true
          cleanup()
          resolve()
        }
      })
      client.on('offline', () => {
        deviceStore.setMqttState(false, '已断开', '')
        scheduleReconnect()
      })
      client.on('close', () => {
        deviceStore.setMqttState(false, '已断开', '')
        scheduleReconnect()
      })
      client.on('message', handleIncomingMessage)
      client.on('error', (error) => {
        const message = error && error.message ? error.message : 'MQTT 连接异常'
        deviceStore.setMqttState(false, '连接异常', message)
        deviceStore.pushLog({ direction: 'sys', cmd: 'mqtt_error', result: 'error', payloadText: message })
        if (!settled) {
          settled = true
          cleanup()
          reject(error)
          scheduleReconnect()
        }
      })
      client.connect()
    })
    return connectPromise
  },

  disconnect() {
    manualDisconnect = true
    clearReconnectTimer()
    if (client) client.end(true)
    client = null
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
    connectPromise = null
    Object.keys(pendingMap).forEach((key) => clearPending(key, false))
    pendingMap = {}
    deviceStore.setMqttState(false, '已断开', '')
  },

  subscribeAllDevices() {
    subscribeTopics()
  },

  sendCommand(payload) {
    if (!payload || !payload.dev_id) return Promise.reject(new Error('设备ID为空'))

    if (deviceStore.state.mqtt.mockMode) {
      return new Promise((resolve, reject) => {
        registerPending(payload, resolve, reject)
        deviceStore.pushLog({
          direction: 'tx', topic: getTopics(payload.dev_id).cmd,
          cmd: payload.cmd, seq: payload.seq, devId: payload.dev_id,
          result: 'pending', payloadText: buildPayloadText(payload)
        })
      })
    }

    if (!client || !client.isConnected()) return Promise.reject(new Error('MQTT未连接'))
    return new Promise((resolve, reject) => publishPayload(payload, resolve, reject))
  },

  setMockMode(enabled) {
    deviceStore.setMockMode(enabled)
    deviceStore.setMqttState(!!enabled, enabled ? '模拟模式' : '未连接', '')
  },

  injectMockMessage(message, topic) {
    handleIncomingMessage(topic || getTopics(message.dev_id).status, buildPayloadText(message))
  },

  injectMockStatusReport() {
    const devId = deviceStore.state.currentDeviceId
    this.injectMockMessage(makeMockStatusReport(devId), getTopics(devId).status)
  },

  injectMockHeartbeat() {
    const devId = deviceStore.state.currentDeviceId
    this.injectMockMessage(makeMockHeartbeat(devId), getTopics(devId).heartbeat)
  },

  injectMockEvent() {
    const devId = deviceStore.state.currentDeviceId
    this.injectMockMessage(makeMockEvent(devId), getTopics(devId).event)
  },

  injectLatestPendingAck() {
    const pending = getLatestPending()
    if (!pending) return false
    const payload = pending.payload
    const data = {}
    if (payload.cmd === 'set_output') Object.assign(data, payload.data, { manual_hold: true, control_mode: 'manual' })
    if (payload.cmd === 'set_outputs') data.outputs = payload.data.outputs.map((item) => ({ ...item, manual_hold: true, control_mode: 'manual' }))
    if (payload.cmd === 'resume_auto') Object.assign(data, payload.data)
    if (payload.cmd === 'set_task') data.channel = payload.data.task.channel
    if (payload.cmd === 'enable_task' || payload.cmd === 'delete_task') Object.assign(data, payload.data)
    if (payload.cmd === 'set_intermittent') Object.assign(data, payload.data)
    this.injectMockMessage({
      ver: PROTOCOL_VER,
      seq: payload.seq,
      dev_id: payload.dev_id,
      cmd: payload.cmd + '_ack',
      ts: Math.floor(Date.now() / 1000),
      result: 'ok',
      data
    }, getTopics(payload.dev_id).ack)
    return true
  }
}
