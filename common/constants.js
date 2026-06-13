/**
 * SC0479 小程序 V2.0 固定定义。
 *
 * 这里仅保存跨页面、跨模块共用的常量，避免业务值散落在页面中。
 */

export const PROTOCOL_VER = '2.0'
/* 当前为联调Broker；正式服务器地址及后续变更方式待项目确认。 */
// 【重要】微信小程序真机必须使用 wss:// 加密协议，且域名需在小程序后台配置白名单
// 端口必须是 443（WSS 默认端口），不能使用其他端口
export const DEFAULT_WS_URL = 'wss://broker.emqx.io:8084/mqtt'
export const DEFAULT_TOPIC_ROOT = 'sc0479'
export const DEVICE_ID_PATTERN = /^GW4G_[0-9]{9}$/

export const HEARTBEAT_INTERVAL_SEC = 60
export const OFFLINE_TIMEOUT_SEC = 180

export const USER_ACK_TIMEOUT_MS = 8000
export const DEBUG_ACK_TIMEOUT_MS = 60000
export const USER_CONNECT_TIMEOUT_MS = 12000
export const DEBUG_CONNECT_TIMEOUT_MS = 30000

export const CHANNELS = ['ds1', 'ds2', 'dc12v']
export const CHANNEL_LABELS = {
  ds1: '网口 1',
  ds2: '网口 2',
  dc12v: '光猫'
}

export const CHANNEL_ICONS = {
  ds1: '网1',
  ds2: '网2',
  dc12v: '12V'
}

export const CONTROL_MODE_LABELS = {
  default: '自动待机',
  manual: '手动优先',
  task: '定时任务',
  intermittent: '间歇断网',
  rtc_wait: '等待设备时间',
  unknown: '状态未知'
}

export const WEEK_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' }
]

export const DEFAULT_TASK_PERIOD = { start: '22:00', end: '23:00' }
export const MAX_PERIODS_PER_TASK = 3

export const INTERMITTENT_LIMITS = {
  periodMin: { min: 5, max: 1440, step: 5, defaultValue: 5 },
  count: { min: 5, max: 100, step: 5, defaultValue: 10 },
  durationSec: { min: 5, max: 300, step: 5, defaultValue: 10 }
}

export function makeStepValues(min, max, step) {
  const values = []
  for (let value = min; value <= max; value += step) values.push(value)
  return values
}

export const INTERMITTENT_PERIOD_VALUES = makeStepValues(
  INTERMITTENT_LIMITS.periodMin.min,
  INTERMITTENT_LIMITS.periodMin.max,
  INTERMITTENT_LIMITS.periodMin.step
)
export const INTERMITTENT_COUNT_VALUES = makeStepValues(
  INTERMITTENT_LIMITS.count.min,
  INTERMITTENT_LIMITS.count.max,
  INTERMITTENT_LIMITS.count.step
)
export const INTERMITTENT_DURATION_VALUES = makeStepValues(
  INTERMITTENT_LIMITS.durationSec.min,
  INTERMITTENT_LIMITS.durationSec.max,
  INTERMITTENT_LIMITS.durationSec.step
)

export function buildTopicPrefix(devId, topicRoot) {
  const root = String(topicRoot || DEFAULT_TOPIC_ROOT).replace(/\/+$/, '')
  return root + '/' + devId
}

export function buildTopicMap(devId, topicRoot) {
  const prefix = buildTopicPrefix(devId, topicRoot)
  return {
    prefix,
    cmd: prefix + '/cmd',
    ack: prefix + '/ack',
    status: prefix + '/status',
    heartbeat: prefix + '/heartbeat',
    event: prefix + '/event'
  }
}

export function isValidDeviceId(devId) {
  return DEVICE_ID_PATTERN.test(String(devId || '').trim())
}
