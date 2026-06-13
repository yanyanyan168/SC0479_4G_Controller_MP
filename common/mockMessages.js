/** 调试模式使用的V2.0模拟消息。 */
import { PROTOCOL_VER } from '@/common/constants.js'

function envelope(devId, cmd, data) {
  return {
    ver: PROTOCOL_VER,
    seq: Math.floor(Date.now() / 1000),
    dev_id: devId,
    cmd,
    ts: Math.floor(Date.now() / 1000),
    data: data || {}
  }
}

export function makeMockStatusReport(devId) {
  return envelope(devId, 'status_report', {
    outputs: {
      ds1: { enabled: true, raw_level: 0, control_mode: 'default', manual_hold: false },
      ds2: { enabled: false, raw_level: 1, control_mode: 'manual', manual_hold: true },
      dc12v: { enabled: true, raw_level: 1, control_mode: 'default', manual_hold: false }
    },
    tasks: {
      ds1: { configured: true, enable: true, active: false },
      ds2: { configured: true, enable: true, active: true },
      dc12v: { configured: false, enable: false, active: false }
    },
    intermittent: {
      enable: true,
      period_min: 5,
      count: 10,
      duration_sec: 10,
      active_channels: ['ds2']
    },
    device: { fw_ver: 'SC0479_MCU_V2.0', uptime_sec: 3600 }
  })
}

export function makeMockHeartbeat(devId) {
  return envelope(devId, 'heartbeat', {
    uptime_sec: 3660,
    signal: 24,
    mqtt_connected: true,
    rtc_ok: true
  })
}

export function makeMockEvent(devId) {
  return envelope(devId, 'event', {
    event: 'manual_hold_on',
    channel: 'ds2',
    reason: 'mock event'
  })
}
