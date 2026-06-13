/**
 * SC0479 MQTT JSON V2.0 命令构造器。
 *
 * 页面只能通过本文件创建业务命令，避免字段名和协议版本不一致。
 */
import { PROTOCOL_VER } from '@/common/constants.js'

let nextSeqValue = 2000

function nextSeq() {
  nextSeqValue += 1
  if (nextSeqValue > 0xffffffff) nextSeqValue = 2001
  return nextSeqValue
}

function buildEnvelope(devId, cmd, data) {
  return {
    ver: PROTOCOL_VER,
    seq: nextSeq(),
    dev_id: devId,
    cmd,
    ts: Math.floor(Date.now() / 1000),
    data: data || {}
  }
}

export function buildSetOutput(devId, channel, enabled) {
  return buildEnvelope(devId, 'set_output', { channel, enabled: !!enabled })
}

export function buildSetOutputs(devId, outputs) {
  return buildEnvelope(devId, 'set_outputs', {
    outputs: (Array.isArray(outputs) ? outputs : []).map((item) => ({
      channel: item.channel,
      enabled: !!item.enabled
    }))
  })
}

export function buildResumeAuto(devId, channels) {
  if (channels === true || channels === 'all') {
    return buildEnvelope(devId, 'resume_auto', { all: true })
  }
  return buildEnvelope(devId, 'resume_auto', {
    channels: Array.isArray(channels) ? channels : []
  })
}

export function buildSetTask(devId, task) {
  return buildEnvelope(devId, 'set_task', {
    task: {
      channel: task.channel,
      enable: !!task.enable,
      repeat: Array.isArray(task.repeat) ? task.repeat.slice() : [],
      periods: Array.isArray(task.periods)
        ? task.periods.map((item) => ({ start: item.start, end: item.end }))
        : []
    }
  })
}

export function buildGetTasks(devId) {
  return buildEnvelope(devId, 'get_tasks', {})
}

export function buildEnableTask(devId, channel, enable) {
  return buildEnvelope(devId, 'enable_task', { channel, enable: !!enable })
}

export function buildDeleteTask(devId, channel) {
  return buildEnvelope(devId, 'delete_task', { channel })
}

export function buildSetIntermittent(devId, config) {
  return buildEnvelope(devId, 'set_intermittent', {
    enable: !!config.enable,
    period_min: Number(config.period_min),
    count: Number(config.count),
    duration_sec: Number(config.duration_sec)
  })
}

export function buildGetIntermittent(devId) {
  return buildEnvelope(devId, 'get_intermittent', {})
}
