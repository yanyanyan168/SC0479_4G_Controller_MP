/** 页面显示辅助函数。所有文案使用产品语义，不显示MCU原始电平。 */
import { CHANNEL_LABELS, CONTROL_MODE_LABELS } from '@/common/constants.js'

export function getChannelLabel(channel) {
  return CHANNEL_LABELS[channel] || channel || '未知通道'
}

export function getOutputStateLabel(channel, enabled) {
  if (channel === 'dc12v') return enabled ? '光猫已开启' : '光猫已关闭'
  return enabled ? '网络已连接' : '网络已断开'
}

export function getOutputShortLabel(channel, enabled) {
  if (channel === 'dc12v') return enabled ? '开启' : '关闭'
  return enabled ? '已连接' : '已断开'
}

export function getControlModeLabel(mode) {
  return CONTROL_MODE_LABELS[mode] || CONTROL_MODE_LABELS.unknown
}

export function formatTimestamp(ts) {
  const value = Number(ts || 0)
  if (!value) return '暂无记录'
  const date = new Date(value * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  )
}

export function formatRelativeTime(ts) {
  const value = Number(ts || 0)
  if (!value) return '等待设备上报'
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - value)
  if (diff < 60) return diff + '秒前'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  return formatTimestamp(value)
}

export function formatRepeat(repeat) {
  const values = Array.isArray(repeat) ? repeat.slice().sort((a, b) => a - b) : []
  const key = values.join(',')
  if (key === '1,2,3,4,5,6,7') return '每天'
  if (key === '1,2,3,4,5') return '周一至周五'
  if (key === '6,7') return '周末'
  const map = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' }
  return values.length ? values.map((item) => '周' + map[item]).join('、') : '未选择日期'
}

export function getSignalLabel(signal) {
  const value = Number(signal || 0)
  if (value <= 0) return '未知'
  if (value >= 24) return '优秀'
  if (value >= 16) return '良好'
  if (value >= 9) return '一般'
  return '较弱'
}
