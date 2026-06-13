<template>
  <view class="page">
    <view class="header-row">
      <view class="page-title" @click="onConsoleTitleTap">我的控制台</view>
    </view>

    <view class="hero-card">
      <view v-if="settingsUnlocked" class="hero-settings-entry" @click="goSettings">⚙</view>
      <view class="hero-badge">全新发布</view>
      <view class="hero-title">4G 智能控制器</view>
      <view class="hero-subtitle">三路独立控制 · 定时任务 · 间歇断网</view>
      <view class="hero-footer">
        <view class="hero-dot"></view>
        <view class="hero-dot active"></view>
      </view>
    </view>

    <view class="section-head">
      <view>
        <view class="section-title">我的设备</view>
        <view class="section-caption">在线 {{ onlineSummary.online }}/{{ onlineSummary.total }}</view>
      </view>
      <button class="add-button" @click="openAddSheet">＋ 添加</button>
    </view>

    <view v-if="!state.devices.length" class="empty-card">
      <view class="empty-title">尚未绑定设备</view>
      <view class="empty-text">扫描设备二维码或手动输入设备 ID</view>
      <button class="primary-button" @click="openAddSheet">添加设备</button>
    </view>

    <!-- 在线设备置顶；在线、离线都显示完整设备卡片。 -->
    <view
      v-for="device in sortedDevices"
      :key="device.devId"
      class="device-card"
      :class="[{ offline: !device.online, selected: device.devId === state.currentDeviceId }]"
      @click="selectDevice(device.devId)"
    >
      <view class="device-top">
        <view class="device-icon" aria-label="设备">
          <image class="device-icon-img" src="../../device_icon.png" mode="aspectFit" />
        </view>

        <view class="device-main">
          <!-- 不显示“设备”文字和顺序编号，图标后直接显示完整设备ID。 -->
          <view class="device-name">{{ device.devId }}</view>
          <view class="device-online" :class="device.online ? 'is-online' : ''">
            <text class="status-dot"></text>
            <text>{{ getDeviceOnlineText(device) }}</text>
          </view>
        </view>

        <view class="current-chip" v-if="device.devId === state.currentDeviceId">当前</view>
        <view class="delete-entry" @click.stop="confirmRemoveDevice(device)">删除</view>
      </view>

      <view class="output-summary">
        <view
          v-for="channel in channelDisplayOrder"
          :key="channel"
          class="summary-chip"
          :class="getSummaryChipClass(device.devId, channel)"
        >
          <text>{{ getChannelLabel(channel) }}</text>
          <text class="summary-state">（{{ getOutputShortLabel(channel, getDeviceOutput(device.devId, channel).enabled) }}）</text>
        </view>
      </view>

      <view class="feature-grid">
        <view
          class="feature-button"
          :class="[{ disabled: !device.online }, getManualFeatureClass(device.devId)]"
          @click.stop="openManualSheet(device)"
        >
          <view class="feature-icon">⏻</view>
          <view class="feature-text">
            <view class="feature-label">手动控制</view>
            <view class="feature-state">（{{ getManualFeatureText(device.devId) }}）</view>
          </view>
        </view>

        <view
          class="feature-button"
          :class="[{ disabled: !device.online }, getTaskFeatureClass(device.devId)]"
          @click.stop="openTasksSheet(device)"
        >
          <view class="feature-icon">◷</view>
          <view class="feature-text">
            <view class="feature-label">定时任务</view>
            <view class="feature-state">（{{ getTaskFeatureText(device.devId) }}）</view>
          </view>
        </view>

        <view
          class="feature-button"
          :class="[{ disabled: !device.online }, getIntermittentFeatureClass(device.devId)]"
          @click.stop="openIntermittentSheet(device)"
        >
          <view class="feature-icon intermittent-icon" aria-hidden="true">
            <image class="intermittent-icon-img" src="../../ic_wifi_off.png" mode="aspectFit" />
          </view>
          <view class="feature-text">
            <view class="feature-label">间歇断网</view>
            <view class="feature-state">（{{ getIntermittentFeatureText(device.devId) }}）</view>
          </view>
        </view>
        </view>
       </view>
    <view class="connection-strip" @click="connectBroker(true)">
      <text>{{ state.mqtt.connected ? 'MQTT 已连接' : 'MQTT 未连接，点击重连' }}</text>
      <text>{{ state.mqtt.statusText }}</text>
    </view>

    <!-- 统一遮罩与底部弹层 -->
    <view class="sheet-mask" v-if="activeSheet" @click="closeSheet">
      <view class="bottom-sheet" :class="{ tall: activeSheet === 'taskEdit' || activeSheet === 'intermittent' }" @click.stop>
        <view class="sheet-header">
          <view class="sheet-title">{{ sheetTitle }}</view>
          <view class="sheet-close" @click="closeSheet">×</view>
        </view>

        <!-- 绑定设备 -->
        <view v-if="activeSheet === 'add'" class="sheet-content">
          <button class="scan-button" @click="scanDevice">▣　扫描二维码添加设备</button>
          <view class="or-line"><text></text><view>或</view><text></text></view>
          <view class="field-label">手动输入编号添加设备</view>
          <view class="inline-input-row">
            <input
              class="dark-input"
              type="number"
              :value="manualDeviceId"
              placeholder="请输入 9 位数字"
              maxlength="9"
              @input="onManualDeviceInput"
            />
            <button class="secondary-button bind-button" @click="bindManualDevice">绑定</button>
          </view>
          <view class="input-hint">只需输入 9 位数字，系统自动添加 GW4G_ 前缀</view>
        </view>

        <!-- 手动控制 -->
        <view v-if="activeSheet === 'manual'" class="sheet-content">
          <view class="dual-actions">
            <button class="secondary-button" :disabled="isBusy" @click="setAllOutputs(true)">全部恢复/开启</button>
            <button class="secondary-button danger-text" :disabled="isBusy" @click="setAllOutputs(false)">全部断开/关闭</button>
          </view>

          <view class="manual-list">
            <view v-for="channel in channelDisplayOrder" :key="channel" class="manual-row">
              <view>
                <view class="manual-name">{{ getChannelLabel(channel) }}</view>
                <view class="manual-sub">
                  {{ getOutputStateLabel(channel, state.outputs[channel].enabled) }}
                  <text v-if="state.outputs[channel].manualHold" class="manual-hold"> · 手动优先</text>
                </view>
              </view>
              <switch
                color="#2468ff"
                :checked="state.outputs[channel].enabled"
                :disabled="isBusy"
                @change="onOutputSwitch(channel, $event)"
              />
              <button
                v-if="state.outputs[channel].manualHold"
                class="tiny-button"
                :disabled="isBusy"
                @click="resumeChannelAuto(channel)"
              >恢复自动</button>
            </view>
          </view>

          <button
            class="primary-button sheet-main-button"
            :disabled="isBusy || !hasAnyManualHold"
            @click="resumeAllAuto"
          >全部恢复自动控制</button>
        </view>

        <!-- 定时任务列表 -->
        <view v-if="activeSheet === 'tasks'" class="sheet-content">
          <view class="task-tip">每个通道仅一个任务，每个任务最多 3 个时间段</view>
          <view v-for="channel in channelDisplayOrder" :key="channel" class="task-card">
            <view class="task-card-head">
              <view>
                <view class="task-channel">{{ getChannelLabel(channel) }}</view>
                <view class="task-repeat">{{ formatRepeat(state.tasks[channel].repeat) }}</view>
              </view>
              <switch
                color="#2468ff"
                :checked="state.tasks[channel].enable"
                :disabled="!state.tasks[channel].configured || isBusy"
                @change="onTaskEnable(channel, $event)"
              />
            </view>
            <view v-if="state.tasks[channel].configured" class="period-tags">
              <view v-for="(period, index) in state.tasks[channel].periods" :key="index" class="period-tag">
                {{ period.start }} - {{ period.end }}
              </view>
            </view>
            <view v-else class="task-empty">尚未设置任务</view>
            <view class="task-actions">
              <button class="secondary-button compact" @click="openTaskEditor(channel)">
                {{ state.tasks[channel].configured ? '编辑任务' : '添加任务' }}
              </button>
              <button
                v-if="state.tasks[channel].configured"
                class="secondary-button compact danger-text"
                :disabled="isBusy"
                @click="deleteTask(channel)"
              >删除</button>
            </view>
          </view>
          <button class="secondary-button full-width" :disabled="isBusy" @click="refreshTasks">从设备读取任务</button>
        </view>

        <!-- 定时任务编辑 -->
        <scroll-view v-if="activeSheet === 'taskEdit'" class="sheet-scroll" scroll-y>
          <view class="sheet-content">
            <view class="field-label">重复日期（周一至周日）</view>
            <view class="week-shortcuts">
              <button class="shortcut" @click="setWeekPreset('all')">每天</button>
              <button class="shortcut" @click="setWeekPreset('workday')">工作日</button>
              <button class="shortcut" @click="setWeekPreset('weekend')">周末</button>
            </view>
            <view class="week-grid">
              <view
                v-for="item in weekOptions"
                :key="item.value"
                class="week-item"
                :class="{ active: taskForm.repeat.includes(item.value) }"
                @click="toggleWeek(item.value)"
              >{{ item.label }}</view>
            </view>

            <view class="period-editor" v-for="(period, index) in taskForm.periods" :key="index">
              <view class="period-editor-head">
                <view>时间段 {{ index + 1 }}</view>
                <view v-if="taskForm.periods.length > 1" class="remove-text" @click="removePeriod(index)">删除</view>
              </view>
              <view class="time-row">
                <picker mode="time" :value="period.start" @change="onPeriodTime(index, 'start', $event)">
                  <view class="time-box">
                    <view class="time-label">开始时间</view>
                    <view class="time-value">{{ period.start }}</view>
                  </view>
                </picker>
                <view class="time-separator">-</view>
                <picker mode="time" :value="period.end" @change="onPeriodTime(index, 'end', $event)">
                  <view class="time-box">
                    <view class="time-label">结束时间</view>
                    <view class="time-value">{{ period.end }}</view>
                  </view>
                </picker>
              </view>
            </view>

            <button
              v-if="taskForm.periods.length < 3"
              class="dashed-button"
              @click="addPeriod"
            >＋ 添加时间段（最多 3 段）</button>

            <view class="task-channel-box">
              <view class="field-label">当前任务通道</view>
              <view class="fixed-channel">{{ getChannelLabel(taskForm.channel) }}</view>
              <view class="input-hint">一个任务只管理一个硬件通道</view>
            </view>

            <view class="form-warning" v-if="taskFormError">{{ taskFormError }}</view>

            <view class="bottom-actions">
              <button class="secondary-button" @click="activeSheet = 'tasks'">取消</button>
              <button class="primary-button" :disabled="isBusy" @click="saveTask">确认保存</button>
            </view>
          </view>
        </scroll-view>

        <!-- 间歇断网 -->
        <scroll-view v-if="activeSheet === 'intermittent'" class="sheet-scroll" scroll-y>
          <view class="sheet-content">
            <view class="intermittent-enable-card">
              <view>
                <view class="manual-name">启用间歇断网</view>
                <view class="manual-sub">仅网口 1、网口 2 在各自任务时间段内参与</view>
              </view>
              <switch color="#2468ff" :checked="intermittentForm.enable" @change="intermittentForm.enable = $event.detail.value" />
            </view>

            <view class="parameter-card">
              <picker :range="periodValues" :value="periodPickerIndex" @change="onIntermittentPicker('period_min', $event)">
                <view class="parameter-row">
                  <view><view class="parameter-name">统计周期时长</view><view class="parameter-unit">单位：分钟</view></view>
                  <view class="parameter-value">{{ intermittentForm.period_min }}</view>
                </view>
              </picker>
              <picker :range="countValues" :value="countPickerIndex" @change="onIntermittentPicker('count', $event)">
                <view class="parameter-row">
                  <view><view class="parameter-name">周期内平均断网</view><view class="parameter-unit">单位：次</view></view>
                  <view class="parameter-value">{{ intermittentForm.count }}</view>
                </view>
              </picker>
              <picker :range="durationValues" :value="durationPickerIndex" @change="onIntermittentPicker('duration_sec', $event)">
                <view class="parameter-row no-border">
                  <view><view class="parameter-name">每次断网时长</view><view class="parameter-unit">单位：秒</view></view>
                  <view class="parameter-value">{{ intermittentForm.duration_sec }}</view>
                </view>
              </picker>
            </view>

            <view class="strategy-text">{{ intermittentDescription }}</view>
            <button class="primary-button sheet-main-button" :disabled="isBusy" @click="saveIntermittent">保存并下发设备</button>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  CHANNELS,
  CHANNEL_LABELS,
  DEFAULT_TASK_PERIOD,
  INTERMITTENT_COUNT_VALUES,
  INTERMITTENT_DURATION_VALUES,
  INTERMITTENT_PERIOD_VALUES,
  WEEK_OPTIONS,
  isValidDeviceId
} from '@/common/constants.js'
import {
  buildDeleteTask,
  buildEnableTask,
  buildGetIntermittent,
  buildGetTasks,
  buildResumeAuto,
  buildSetIntermittent,
  buildSetOutput,
  buildSetOutputs,
  buildSetTask
} from '@/common/protocol.js'
import {
  formatRelativeTime,
  formatRepeat,
  getChannelLabel,
  getOutputShortLabel,
  getOutputStateLabel
} from '@/common/statusMapper.js'
import { mqttClient } from '@/common/mqttClient.js'
import { deviceStore } from '@/store/deviceStore.js'

const state = deviceStore.state
const channelDisplayOrder = ['dc12v', 'ds1', 'ds2']
const weekOptions = WEEK_OPTIONS
const periodValues = INTERMITTENT_PERIOD_VALUES
const countValues = INTERMITTENT_COUNT_VALUES
const durationValues = INTERMITTENT_DURATION_VALUES
const SETTINGS_UNLOCK_TAP_TARGET = 10
const SETTINGS_UNLOCK_HINT_START = 7

const activeSheet = ref('')
const activeDeviceId = ref('')
const manualDeviceId = ref('')
const busyKey = ref('')
const connecting = ref(false)
const settingsUnlocked = ref(false)
const settingsUnlockTapCount = ref(0)

const taskForm = reactive({
  channel: 'ds1',
  enable: true,
  repeat: [1, 2, 3, 4, 5, 6, 7],
  periods: [{ ...DEFAULT_TASK_PERIOD }]
})

const intermittentForm = reactive({
  enable: false,
  period_min: 5,
  count: 10,
  duration_sec: 10
})

const onlineSummary = computed(() => deviceStore.getOnlineSummary())
const sortedDevices = computed(() => {
  return state.devices
    .slice()
    .sort((a, b) => {
      if (!!a.online !== !!b.online) return a.online ? -1 : 1
      return Number(a.order || 0) - Number(b.order || 0)
    })
})
const isBusy = computed(() => !!busyKey.value)
const hasAnyManualHold = computed(() => CHANNELS.some((channel) => state.outputs[channel] && state.outputs[channel].manualHold))
const sheetTitle = computed(() => {
  const id = activeDeviceId.value || state.currentDeviceId
  if (activeSheet.value === 'add') return '绑定新设备'
  if (activeSheet.value === 'manual') return '手动控制 - ' + id
  if (activeSheet.value === 'tasks') return '定时任务 - ' + id
  if (activeSheet.value === 'taskEdit') return getChannelLabel(taskForm.channel) + '定时任务'
  if (activeSheet.value === 'intermittent') return '间歇设置 - ' + id
  return ''
})

const periodPickerIndex = computed(() => Math.max(0, periodValues.indexOf(Number(intermittentForm.period_min))))
const countPickerIndex = computed(() => Math.max(0, countValues.indexOf(Number(intermittentForm.count))))
const durationPickerIndex = computed(() => Math.max(0, durationValues.indexOf(Number(intermittentForm.duration_sec))))
const intermittentDescription = computed(() => {
  if (!intermittentForm.enable) return '间歇断网未启用。'
  return '系统将在每 ' + intermittentForm.period_min + ' 分钟内，分别对处于任务时间段的网口平均执行 ' + intermittentForm.count + ' 次断网，每次持续 ' + intermittentForm.duration_sec + ' 秒。'
})
const taskFormError = computed(() => validateTaskForm(false))

function goSettings() {
  uni.navigateTo({ url: '/pages/settings/settings' })
}

function onConsoleTitleTap() {
  let remaining = 0

  if (settingsUnlocked.value) return

  settingsUnlockTapCount.value += 1
  remaining = SETTINGS_UNLOCK_TAP_TARGET - settingsUnlockTapCount.value

  if (remaining <= 0) {
    settingsUnlocked.value = true
    uni.showToast({ title: '设置入口已显示', icon: 'none' })
    return
  }

  if (settingsUnlockTapCount.value < SETTINGS_UNLOCK_HINT_START) return

  uni.showToast({ title: '再点 ' + remaining + ' 次显示设置', icon: 'none' })
}

watch(
  () => state.ui.debugMode,
  (enabled) => {
    if (enabled) return
    settingsUnlocked.value = false
    settingsUnlockTapCount.value = 0
  }
)

function getDeviceOutput(devId, channel) {
  const runtime = deviceStore.getRuntime(devId)
  return runtime.outputs[channel] || { enabled: false }
}

function getSummaryChipClass(devId, channel) {
  const output = getDeviceOutput(devId, channel)
  if (!output.enabled) return 'is-off'
  return 'is-on'
}

function getDeviceOnlineText(device) {
  if (device.online) return '已连接（4G 在线）'
  return device.lastSeenTs ? '已离线 · 最近在线 ' + formatRelativeTime(device.lastSeenTs) : '已离线 · 等待设备上报'
}

function getDeviceRuntimeSafe(devId) {
  return deviceStore.getRuntime(devId)
}

function getManualFeatureText(devId) {
  const runtime = getDeviceRuntimeSafe(devId)
  return CHANNELS.some((channel) => runtime.outputs[channel] && runtime.outputs[channel].manualHold) ? '已启用' : '未启用'
}

function getManualFeatureClass(devId) {
  return getManualFeatureText(devId) === '已启用' ? 'feature-on' : ''
}

function getTaskFeatureText(devId) {
  const runtime = getDeviceRuntimeSafe(devId)
  return CHANNELS.some((channel) => runtime.tasks[channel] && runtime.tasks[channel].configured && runtime.tasks[channel].enable) ? '已启用' : '未启用'
}

function getTaskFeatureClass(devId) {
  return getTaskFeatureText(devId) === '已启用' ? 'feature-on' : ''
}

function getIntermittentFeatureText(devId) {
  const runtime = getDeviceRuntimeSafe(devId)
  return runtime.intermittent && runtime.intermittent.enable ? '已启用' : '未启用'
}

function getIntermittentFeatureClass(devId) {
  return getIntermittentFeatureText(devId) === '已启用' ? 'feature-on' : ''
}

function selectDevice(devId) {
  deviceStore.switchDevice(devId)
}

function ensureDeviceAvailable(device) {
  if (!device || !device.online) {
    uni.showToast({ title: '设备离线，暂时无法操作', icon: 'none' })
    return false
  }
  deviceStore.switchDevice(device.devId)
  activeDeviceId.value = device.devId
  return true
}

function openAddSheet() {
  manualDeviceId.value = ''
  activeSheet.value = 'add'
}

function openManualSheet(device) {
  if (!ensureDeviceAvailable(device)) return
  activeSheet.value = 'manual'
}

function openTasksSheet(device) {
  if (!ensureDeviceAvailable(device)) return
  activeSheet.value = 'tasks'
  refreshTasks(false)
}

function openIntermittentSheet(device) {
  if (!ensureDeviceAvailable(device)) return
  const config = deviceStore.getRuntime(device.devId).intermittent
  Object.assign(intermittentForm, {
    enable: !!config.enable,
    period_min: Number(config.period_min || 5),
    count: Number(config.count || 10),
    duration_sec: Number(config.duration_sec || 10)
  })
  activeSheet.value = 'intermittent'
  refreshIntermittent(false)
}

function closeSheet() {
  if (isBusy.value) return
  activeSheet.value = ''
  activeDeviceId.value = ''
}

function normalizeDeviceNumber(rawValue) {
  const value = String(rawValue || '').trim()

  /* 新版二维码和手工输入均以9位数字为主。 */
  if (/^[0-9]{9}$/.test(value)) return 'GW4G_' + value

  /* 兼容已经生成的完整设备ID。 */
  if (/^GW4G_[0-9]{9}$/.test(value)) return value

  return ''
}

function parseDeviceCode(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return ''

  /* 兼容早期JSON二维码，但最终仍统一转换成GW4G_加9位数字。 */
  try {
    const obj = JSON.parse(text)
    if (obj && obj.type === 'sc0479_device') {
      return normalizeDeviceNumber(obj.dev_id || obj.code || '')
    }
  } catch (error) {}

  return normalizeDeviceNumber(text)
}

function bindDeviceId(devId) {
  if (!isValidDeviceId(devId, false)) {
    uni.showToast({ title: '请输入或扫描 9 位数字', icon: 'none' })
    return
  }

  const exists = deviceStore.getDevice(devId)
  if (exists) {
    uni.showModal({
      title: '设备已绑定',
      content: '是否切换到该设备？',
      success: (res) => {
        if (!res.confirm) return
        deviceStore.switchDevice(devId)
        closeSheet()
      }
    })
    return
  }

  deviceStore.addDevice({ devId })
  if (state.mqtt.connected) mqttClient.subscribeAllDevices()
  closeSheet()
  uni.showToast({ title: '设备已绑定', icon: 'none' })
}

function scanDevice() {
  uni.scanCode({
    scanType: ['qrCode'],
    success: (res) => {
      const devId = parseDeviceCode(res.result)
      if (!devId) {
        uni.showToast({ title: '二维码应为 9 位数字', icon: 'none' })
        return
      }
      bindDeviceId(devId)
    },
    fail: (error) => {
      if (String(error && error.errMsg || '').includes('cancel')) return
      uni.showToast({ title: '扫码失败，请重试', icon: 'none' })
    }
  })
}

function onManualDeviceInput(event) {
  manualDeviceId.value = String(event && event.detail && event.detail.value || '')
    .replace(/[^0-9]/g, '')
    .slice(0, 9)
}

function bindManualDevice() {
  bindDeviceId(normalizeDeviceNumber(manualDeviceId.value))
}

function confirmRemoveDevice(device) {
  uni.showModal({
    title: '解绑设备',
    content: '仅删除本机绑定关系，不会清除设备内任务。确定解绑“' + (device.name || device.devId) + '”？',
    confirmColor: '#ef4444',
    success: (res) => {
      if (!res.confirm) return
      deviceStore.removeDevice(device.devId)
    }
  })
}

function getErrorText(error) {
  if (error && error.error && error.error.message) return error.error.message
  if (error && error.message) return error.message
  return '操作失败，请稍后重试'
}

async function runCommand(key, command, successText) {
  if (busyKey.value) return null
  busyKey.value = key
  uni.showLoading({ title: '等待设备确认…', mask: true })
  try {
    const ack = await mqttClient.sendCommand(command)
    uni.hideLoading()
    if (successText) uni.showToast({ title: successText, icon: 'none' })
    return ack
  } catch (error) {
    uni.hideLoading()
    uni.showToast({ title: getErrorText(error), icon: 'none' })
    return null
  } finally {
    busyKey.value = ''
  }
}

async function onOutputSwitch(channel, event) {
  const enabled = !!event.detail.value
  await runCommand('output_' + channel, buildSetOutput(activeDeviceId.value, channel, enabled), '操作完成')
}

async function setAllOutputs(enabled) {
  const outputs = CHANNELS.map((channel) => ({ channel, enabled }))
  const ack = await runCommand('outputs_all', buildSetOutputs(activeDeviceId.value, outputs), enabled ? '全部开启完成' : '全部关闭完成')
  if (ack) deviceStore.setLocalOutputs(activeDeviceId.value, outputs, true)
}

async function resumeChannelAuto(channel) {
  const ack = await runCommand('resume_' + channel, buildResumeAuto(activeDeviceId.value, [channel]), '已恢复自动')
  if (ack) deviceStore.clearLocalManualHold(activeDeviceId.value, [channel])
}

async function resumeAllAuto() {
  const ack = await runCommand('resume_all', buildResumeAuto(activeDeviceId.value, true), '全部通道已恢复自动')
  if (ack) deviceStore.clearLocalManualHold(activeDeviceId.value, true)
}

async function refreshTasks(showToast = true) {
  if (!activeDeviceId.value || !state.mqtt.connected) return
  const ack = await runCommand('get_tasks', buildGetTasks(activeDeviceId.value), showToast ? '任务已更新' : '')
  return ack
}

function openTaskEditor(channel) {
  const source = state.tasks[channel]
  taskForm.channel = channel
  taskForm.enable = source.configured ? !!source.enable : true
  taskForm.repeat = source.configured && source.repeat.length ? source.repeat.slice() : [1, 2, 3, 4, 5, 6, 7]
  taskForm.periods = source.configured && source.periods.length
    ? source.periods.map((item) => ({ start: item.start, end: item.end }))
    : [{ ...DEFAULT_TASK_PERIOD }]
  activeSheet.value = 'taskEdit'
}

function setWeekPreset(type) {
  if (type === 'all') taskForm.repeat = [1, 2, 3, 4, 5, 6, 7]
  if (type === 'workday') taskForm.repeat = [1, 2, 3, 4, 5]
  if (type === 'weekend') taskForm.repeat = [6, 7]
}

function toggleWeek(value) {
  const index = taskForm.repeat.indexOf(value)
  if (index >= 0) taskForm.repeat.splice(index, 1)
  else taskForm.repeat.push(value)
  taskForm.repeat.sort((a, b) => a - b)
}

function onPeriodTime(index, field, event) {
  const nextValue = event.detail.value
  const current = taskForm.periods[index]
  const nextStart = field === 'start' ? nextValue : current.start
  const nextEnd = field === 'end' ? nextValue : current.end
  const startMinute = timeToMinute(nextStart)
  const endMinute = timeToMinute(nextEnd)

  if (startMinute >= 0 && endMinute >= 0 && startMinute >= endMinute) {
    uni.showToast({ title: field === 'start' ? '开始时间必须早于结束时间' : '结束时间必须晚于开始时间', icon: 'none' })
    return
  }

  taskForm.periods[index][field] = nextValue
}

function addPeriod() {
  if (taskForm.periods.length >= 3) return
  taskForm.periods.push({ ...DEFAULT_TASK_PERIOD })
}

function removePeriod(index) {
  if (taskForm.periods.length <= 1) return
  taskForm.periods.splice(index, 1)
}

function timeToMinute(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return -1
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return -1
  return hour * 60 + minute
}

function validateTaskForm(shouldNormalize = true) {
  if (!taskForm.repeat.length) return '请至少选择一天'
  if (taskForm.periods.length < 1 || taskForm.periods.length > 3) return '时间段数量应为 1 至 3 段'
  const ranges = []
  for (let i = 0; i < taskForm.periods.length; i += 1) {
    const item = taskForm.periods[i]
    const start = timeToMinute(item.start)
    const end = timeToMinute(item.end)
    if (start < 0 || end < 0) return '第 ' + (i + 1) + ' 段时间格式错误'
    if (start >= end) return '第 ' + (i + 1) + ' 段开始时间必须早于结束时间，且不能跨天'
    ranges.push({ start, end, source: item })
  }
  ranges.sort((a, b) => a.start - b.start)
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) return '时间段不能重叠，请调整后再保存'
  }
  if (shouldNormalize) taskForm.periods = ranges.map((item) => ({ ...item.source }))
  return ''
}

async function saveTask() {
  const errorText = validateTaskForm()
  if (errorText) {
    uni.showToast({ title: errorText, icon: 'none' })
    return
  }
  const task = {
    channel: taskForm.channel,
    enable: !!taskForm.enable,
    repeat: taskForm.repeat.slice(),
    periods: taskForm.periods.map((item) => ({ start: item.start, end: item.end }))
  }
  const ack = await runCommand('set_task_' + task.channel, buildSetTask(activeDeviceId.value, task), '任务保存成功')
  if (!ack) return
  deviceStore.setLocalTask(activeDeviceId.value, { ...task, configured: true, active: false })
  activeSheet.value = 'tasks'
}

async function onTaskEnable(channel, event) {
  const enable = !!event.detail.value
  const ack = await runCommand('enable_task_' + channel, buildEnableTask(activeDeviceId.value, channel, enable), enable ? '任务已启用' : '任务已停用')
  if (ack) deviceStore.setLocalTaskEnabled(activeDeviceId.value, channel, enable)
}

function deleteTask(channel) {
  uni.showModal({
    title: '删除任务',
    content: '确定删除' + getChannelLabel(channel) + '的定时任务？',
    confirmColor: '#ef4444',
    success: async (res) => {
      if (!res.confirm) return
      const ack = await runCommand('delete_task_' + channel, buildDeleteTask(activeDeviceId.value, channel), '任务已删除')
      if (ack) deviceStore.deleteLocalTask(activeDeviceId.value, channel)
    }
  })
}

async function refreshIntermittent(showToast = true) {
  if (!activeDeviceId.value || !state.mqtt.connected) return
  const ack = await runCommand('get_intermittent', buildGetIntermittent(activeDeviceId.value), showToast ? '设置已更新' : '')
  if (ack && ack.data) Object.assign(intermittentForm, ack.data)
}

function onIntermittentPicker(field, event) {
  const index = Number(event.detail.value || 0)
  const nextPeriodMin = field === 'period_min' ? periodValues[index] : Number(intermittentForm.period_min)
  const nextCount = field === 'count' ? countValues[index] : Number(intermittentForm.count)
  const nextDurationSec = field === 'duration_sec' ? durationValues[index] : Number(intermittentForm.duration_sec)
  const errorText = validateIntermittentForm(nextPeriodMin, nextCount, nextDurationSec)

  if (errorText) {
    uni.showToast({ title: errorText, icon: 'none' })
    return
  }

  if (field === 'period_min') intermittentForm.period_min = nextPeriodMin
  if (field === 'count') intermittentForm.count = nextCount
  if (field === 'duration_sec') intermittentForm.duration_sec = nextDurationSec
}

function validateIntermittentForm(periodMin, count, durationSec) {
  if (Number(count) * Number(durationSec) >= Number(periodMin) * 60) return '断网总时长必须小于统计周期'
  return ''
}

async function saveIntermittent() {
  const errorText = validateIntermittentForm(intermittentForm.period_min, intermittentForm.count, intermittentForm.duration_sec)
  if (errorText) {
    uni.showToast({ title: errorText, icon: 'none' })
    return
  }
  const config = {
    enable: !!intermittentForm.enable,
    period_min: Number(intermittentForm.period_min),
    count: Number(intermittentForm.count),
    duration_sec: Number(intermittentForm.duration_sec)
  }
  const ack = await runCommand('set_intermittent', buildSetIntermittent(activeDeviceId.value, config), '间歇设置已保存')
  if (ack) deviceStore.setLocalIntermittent(activeDeviceId.value, config)
}

async function connectBroker(showToast) {
  if (connecting.value || state.mqtt.connected || !state.devices.length) return
  connecting.value = true
  try {
    await mqttClient.connect()
    if (showToast) uni.showToast({ title: '云端连接成功', icon: 'none' })
  } catch (error) {
    if (showToast) uni.showToast({ title: getErrorText(error), icon: 'none' })
  } finally {
    connecting.value = false
  }
}

onMounted(() => {
  setTimeout(() => connectBroker(false), 300)
})
</script>

<style scoped>
page { background: #020817; }
button::after { border: none; }
button { margin: 0; line-height: 1; box-sizing: border-box; }
.page {
  min-height: 100vh;
  padding: calc(var(--status-bar-height) + 24rpx) 26rpx calc(80rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: radial-gradient(circle at 72% 10%, rgba(36,104,255,0.12), transparent 25%), #020817;
  color: #f5f8ff;
}
.header-row { display: flex; align-items: center; margin: 8rpx 6rpx 36rpx; }
.page-title { font-size: 32rpx; font-weight: 800; letter-spacing: 1rpx; }
.hero-card { position: relative; overflow: hidden; padding: 62rpx 36rpx 32rpx; border-radius: 34rpx; background: linear-gradient(135deg, #393190, #151f3d 78%); box-shadow: 0 28rpx 60rpx rgba(0,0,0,0.28); }
.hero-card::after { content: ''; position: absolute; width: 360rpx; height: 360rpx; right: -160rpx; top: -160rpx; border-radius: 50%; background: rgba(255,255,255,0.04); }
.hero-settings-entry { position: absolute; top: 26rpx; right: 26rpx; z-index: 2; width: 68rpx; height: 68rpx; display: flex; align-items: center; justify-content: center; border-radius: 20rpx; background: rgba(7,17,38,0.28); border: 1rpx solid rgba(183,202,230,0.28); color: #e8f0ff; font-size: 36rpx; }
.hero-badge { display: inline-flex; padding: 12rpx 22rpx; border-radius: 12rpx; background: #f6bd00; color: #101010; font-size: 24rpx; font-weight: 900; }
.hero-title { margin-top: 26rpx; font-size: 38rpx; font-weight: 900; }
.hero-subtitle { margin-top: 12rpx; color: #c7d4ee; font-size: 25rpx; }
.hero-footer { margin-top: 36rpx; display: flex; justify-content: center; gap: 10rpx; }
.hero-dot { width: 12rpx; height: 12rpx; border-radius: 999rpx; background: #77819a; }
.hero-dot.active { width: 28rpx; background: #ffffff; }
.section-head { margin: 48rpx 6rpx 24rpx; display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 42rpx; font-weight: 900; }
.section-caption { margin-top: 8rpx; color: #7184a4; font-size: 23rpx; }
.add-button { width: auto; height: 68rpx; padding: 0 28rpx; display: flex; align-items: center; border-radius: 24rpx; background: #2468ff; color: #fff; font-size: 27rpx; font-weight: 800; box-shadow: 0 14rpx 28rpx rgba(36,104,255,0.26); }
.device-card { margin-bottom: 28rpx; padding: 30rpx; border-radius: 30rpx; background: #121d34; border: 1rpx solid #263650; box-shadow: 0 18rpx 38rpx rgba(0,0,0,0.24); }
.device-card.selected { border-color: #315dba; }
.device-card.offline { opacity: 0.58; }
.device-top { display: flex; align-items: flex-start; gap: 20rpx; }
.device-icon { width: 76rpx; height: 76rpx; flex-shrink: 0; border-radius: 22rpx; display: flex; align-items: center; justify-content: center; background: #1b315a; color: #4ea1ff; font-size: 42rpx; }
.device-main { flex: 1; min-width: 0; }
.device-name { font-size: 34rpx; font-weight: 900; letter-spacing: 1rpx; word-break: break-all; }
.device-id { margin-top: 5rpx; color: #8fa2c1; font-size: 21rpx; }
.device-online { margin-top: 12rpx; display: flex; align-items: center; gap: 10rpx; color: #8092b2; font-size: 23rpx; }
.device-online.is-online { color: #00dd77; }
.status-dot { width: 18rpx; height: 18rpx; border-radius: 50%; background: currentColor; }
.current-chip { padding: 6rpx 12rpx; border-radius: 999rpx; background: rgba(36,104,255,0.18); color: #6ca8ff; font-size: 20rpx; }
.delete-entry { padding: 6rpx; color: #7487a7; font-size: 34rpx; }
.output-summary { margin-top: 22rpx; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10rpx; }
.summary-chip { min-width: 0; min-height: 52rpx; padding: 10rpx 8rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx; text-align: center; border-radius: 13rpx; background: #1b273d; border: 1rpx solid #34445f; color: #a8b7cf; font-size: 21rpx; }
.summary-chip.is-off { color: #ff4050; border-color: #8a2d3a; background: rgba(105,22,39,0.28); }
.summary-chip.is-on { color: #00e08a; border-color: #087553; background: rgba(7,85,65,0.28); }
.summary-chip.is-power { color: #8cb9ff; border-color: #315d9a; background: rgba(31,70,125,0.28); }
.summary-state { display: inline-block; margin-top: 0; font-size: 17rpx; opacity: 0.72; }
.feature-grid { margin-top: 24rpx; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10rpx; }
.feature-button { min-height: 88rpx; padding: 12rpx 10rpx; border-radius: 20rpx; display: flex; align-items: center; justify-content: center; gap: 10rpx; color: #c1cee3; background: #1a2942; border: 1rpx solid #2c3b55; font-size: 23rpx; text-align: left; }
.feature-button:first-child { color: #4ca2ff; border-color: #2455a7; background: #172d55; }
.feature-button.disabled { opacity: 0.45; }
.feature-icon { position: relative; left: -14rpx; flex-shrink: 0; font-size: 45rpx; }
.intermittent-icon { width: 48rpx; height: 39rpx; padding: 0; box-sizing: border-box; background: transparent; font-size: 0; }
.intermittent-icon-img { display: block; width: 100%; height: 100%; }
.intermittent-curve { position: absolute; left: 9rpx; top: 1rpx; width: 18rpx; height: 12rpx; border-top: 3rpx solid currentColor; border-radius: 20rpx 20rpx 0 0; transform: rotate(18deg); opacity: 0.96; }
.intermittent-curve::after { content: ''; position: absolute; left: -7rpx; top: 8rpx; width: 14rpx; height: 10rpx; border-top: 3rpx solid currentColor; border-radius: 16rpx 16rpx 0 0; transform: rotate(-30deg); opacity: 0.92; }
.intermittent-slash { position: absolute; left: 12rpx; top: 0; width: 3rpx; height: 25rpx; border-radius: 999rpx; background: currentColor; transform: rotate(48deg); }
.intermittent-dot { position: absolute; width: 3rpx; height: 3rpx; border-radius: 50%; background: currentColor; }
.intermittent-dot-top { left: 3rpx; top: 6rpx; }
.intermittent-dot-bottom { left: 21rpx; top: 19rpx; }
.feature-text { min-width: 0; flex: 0 1 auto; }
.feature-label { font-size: 22rpx; font-weight: 800; line-height: 1.2; white-space: nowrap; }
.connection-strip { margin: 34rpx 8rpx 0; padding: 22rpx; display: flex; justify-content: space-between; color: #647897; font-size: 21rpx; border-top: 1rpx solid #17233a; }
.empty-card { padding: 50rpx 30rpx; text-align: center; border-radius: 30rpx; background: #111b30; border: 1rpx dashed #34445f; }
.empty-title { font-size: 32rpx; font-weight: 800; }
.empty-text { margin: 16rpx 0 30rpx; color: #7f91af; }
.sheet-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; background: rgba(0,5,18,0.76); backdrop-filter: blur(10rpx); }
.bottom-sheet { width: 100%; max-height: 86vh; border-radius: 38rpx 38rpx 0 0; overflow: hidden; background: #0f1a31; border-top: 1rpx solid #263654; box-shadow: 0 -24rpx 70rpx rgba(0,0,0,0.42); padding-bottom: env(safe-area-inset-bottom); }
.bottom-sheet.tall { height: 86vh; }
.sheet-header { height: 112rpx; padding: 0 34rpx; display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid #1e2a43; }
.sheet-title { max-width: 82%; font-size: 34rpx; font-weight: 900; word-break: break-all; }
.sheet-close { width: 64rpx; height: 64rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #16243e; color: #8fa2c1; font-size: 48rpx; }
.sheet-content { padding: 34rpx; box-sizing: border-box; }
.sheet-scroll { height: calc(86vh - 112rpx); }
.scan-button, .primary-button { width: 100%; height: 88rpx; border-radius: 22rpx; display: flex; align-items: center; justify-content: center; background: #2468ff; color: #fff; font-size: 28rpx; font-weight: 900; }
.or-line { margin: 34rpx 0; display: flex; align-items: center; gap: 24rpx; color: #7183a0; }
.or-line text { flex: 1; height: 1rpx; background: #27344d; }
.field-label { margin-bottom: 16rpx; color: #a8b7cf; font-size: 25rpx; }
.inline-input-row { display: grid; grid-template-columns: 1fr 150rpx; gap: 14rpx; }
.dark-input { height: 80rpx; padding: 0 24rpx; box-sizing: border-box; border-radius: 20rpx; border: 1rpx solid #30415f; background: #0d172b; color: #fff; font-size: 26rpx; }
.input-hint { margin-top: 14rpx; color: #617694; font-size: 21rpx; }
.secondary-button { height: 78rpx; padding: 0 18rpx; display: flex; align-items: center; justify-content: center; border-radius: 20rpx; background: #1c2b44; color: #eef4ff; border: 1rpx solid #344761; font-size: 26rpx; font-weight: 800; }
.secondary-button.compact { height: 62rpx; font-size: 23rpx; }
.secondary-button.full-width { width: 100%; margin-top: 22rpx; }
.bind-button { height: 80rpx; }
.danger-text { color: #ff4c5c; }
.dual-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 18rpx; }
.manual-list { margin-top: 28rpx; overflow: hidden; border-radius: 26rpx; background: #071126; border: 1rpx solid #263650; }
.manual-row { min-height: 112rpx; padding: 22rpx 26rpx; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 16rpx; border-bottom: 1rpx solid #17233a; }
.manual-row:last-child { border-bottom: none; }
.manual-name { font-size: 29rpx; font-weight: 800; }
.manual-sub { margin-top: 8rpx; color: #7790b2; font-size: 22rpx; }
.manual-hold { color: #f6bd00; }
.tiny-button { grid-column: 1 / -1; width: auto; height: 52rpx; padding: 0 18rpx; border-radius: 15rpx; background: #223657; color: #7db4ff; font-size: 21rpx; }
.sheet-main-button { margin-top: 28rpx; }
.task-tip { margin-bottom: 20rpx; color: #7286a6; font-size: 22rpx; }
.task-card { margin-bottom: 20rpx; padding: 24rpx; border-radius: 24rpx; background: #1a2942; border: 1rpx solid #30415b; }
.task-card-head { display: flex; align-items: center; justify-content: space-between; }
.task-channel { font-size: 29rpx; font-weight: 900; }
.task-repeat { margin-top: 8rpx; color: #8296b5; font-size: 22rpx; }
.period-tags { margin-top: 20rpx; display: flex; flex-wrap: wrap; gap: 10rpx; }
.period-tag { padding: 9rpx 13rpx; border-radius: 10rpx; background: #080e20; color: #e7eefc; font-size: 22rpx; }
.task-empty { margin-top: 20rpx; color: #667a98; }
.task-actions { margin-top: 22rpx; display: grid; grid-template-columns: 1fr 1fr; gap: 14rpx; }
.week-shortcuts { display: flex; gap: 12rpx; margin-bottom: 20rpx; }
.shortcut { width: auto; height: 54rpx; padding: 0 18rpx; border-radius: 14rpx; background: #182740; color: #8fa7cb; font-size: 21rpx; }
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12rpx; }
.week-item { height: 66rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1rpx solid #34445e; color: #8ea0bd; font-size: 25rpx; }
.week-item.active { color: #fff; background: #2468ff; border-color: #2468ff; }
.period-editor { margin-top: 28rpx; padding: 22rpx; border-radius: 24rpx; background: #111d34; border: 1rpx solid #2b3c58; }
.period-editor-head { display: flex; justify-content: space-between; color: #a8b7cf; font-size: 23rpx; }
.remove-text { color: #ff5968; }
.time-row { margin-top: 20rpx; display: grid; grid-template-columns: 1fr 24rpx 1fr; gap: 10rpx; align-items: center; }
.time-box { min-width: 0; padding: 18rpx; border-radius: 18rpx; background: #0b162b; border: 1rpx solid #30415f; }
.time-label { color: #7286a6; font-size: 20rpx; }
.time-value { margin-top: 8rpx; font-size: 32rpx; font-weight: 800; }
.time-separator { text-align: center; color: #657997; }
.dashed-button { width: 100%; height: 78rpx; margin-top: 22rpx; border-radius: 22rpx; background: transparent; color: #8fa7cb; border: 2rpx dashed #3b4c69; font-size: 25rpx; }
.task-channel-box { margin-top: 28rpx; }
.fixed-channel { height: 72rpx; padding: 0 24rpx; display: flex; align-items: center; border-radius: 18rpx; background: rgba(36,104,255,0.13); border: 1rpx solid #2857a6; color: #68a6ff; font-size: 27rpx; }
.bottom-actions { margin-top: 36rpx; display: grid; grid-template-columns: 0.8fr 1.6fr; gap: 18rpx; padding-bottom: 30rpx; }
.intermittent-enable-card { padding: 26rpx; display: flex; align-items: center; justify-content: space-between; gap: 20rpx; border-radius: 24rpx; background: #17243e; border: 1rpx solid #34445f; }
.parameter-card { margin-top: 28rpx; overflow: hidden; border-radius: 24rpx; background: #071126; border: 1rpx solid #253650; }
.parameter-row { min-height: 112rpx; padding: 22rpx 28rpx; display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid #17233a; }
.parameter-row.no-border { border-bottom: none; }
.parameter-name { font-size: 27rpx; font-weight: 800; }
.parameter-unit { margin-top: 7rpx; color: #647a9b; font-size: 21rpx; }
.parameter-value { width: 150rpx; height: 72rpx; border-radius: 18rpx; display: flex; align-items: center; justify-content: center; background: #111e35; border: 1rpx solid #344761; font-size: 30rpx; font-weight: 900; }
.strategy-text { margin: 24rpx 8rpx 0; color: #6d83a4; font-size: 22rpx; line-height: 1.6; }
button[disabled] { opacity: 0.42; }

/* SC0479 V2.0 UI简洁修正 025 */
.delete-entry {
  min-width: 70rpx !important;
  height: 46rpx !important;
  padding: 0 14rpx !important;
  border-radius: 999rpx !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(255,76,92,0.12) !important;
  color: #ff6b78 !important;
  border: 1rpx solid rgba(255,76,92,0.32) !important;
  font-size: 22rpx !important;
  font-weight: 800 !important;
}
.summary-chip.is-power { color: #00e08a !important; border-color: #087553 !important; background: rgba(7,85,65,0.28) !important; }
.feature-button { gap: 10rpx !important; font-weight: 800 !important; }
.feature-button.feature-on { border-color: #2468ff !important; background: #172d55 !important; color: #6ca8ff !important; }
.feature-icon { position: relative; left: -14rpx; font-size: 45rpx !important; line-height: 1 !important; color: inherit !important; }
.intermittent-icon { width: 48rpx !important; height: 39rpx !important; padding: 0 !important; box-sizing: border-box !important; background: transparent !important; font-size: 0 !important; }
.intermittent-icon-img { display: block !important; width: 100% !important; height: 100% !important; }
.feature-state { margin-top: 4rpx !important; font-size: 16rpx !important; color: #8fa7cb !important; line-height: 1.1 !important; opacity: 0.76 !important; }
.feature-button.feature-on .feature-state { color: #00e08a !important; }
.shortcut, .dashed-button, .secondary-button, .primary-button, .scan-button, .add-button, .tiny-button {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
}
.shortcut { min-width: 82rpx !important; line-height: 1 !important; }
.week-grid { grid-template-columns: repeat(7, 64rpx) !important; justify-content: space-between !important; gap: 0 !important; }
.week-item { width: 64rpx !important; height: 64rpx !important; padding: 0 !important; border-radius: 50% !important; box-sizing: border-box !important; line-height: 64rpx !important; }
.form-warning {
  margin-top: 24rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(255,76,92,0.12);
  border: 1rpx solid rgba(255,76,92,0.35);
  color: #ff7b87;
  font-size: 23rpx;
  line-height: 1.45;
}
.field-label, .manual-sub, .task-repeat, .task-tip, .input-hint, .parameter-unit, .strategy-text { color: #9cafcf !important; }
.time-label { color: #a8b7cf !important; }
.task-empty { color: #8fa2c1 !important; }
.period-editor-head { color: #c0cce0 !important; }
.device-id { color: #a2b2cc !important; }
.connection-strip { color: #8fa2c1 !important; }


/* SC0479 V2.0 设备显示修正 028
 * 在线与离线设备均恢复完整卡片；在线设备仍置顶。
 * 标题不显示“设备”文字及顺序编号，图标后直接显示设备ID。
 */
.device-icon {
  position: relative !important;
  width: 68rpx !important;
  height: 68rpx !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 20rpx !important;
  background: transparent !important;
  color: transparent !important;
}
.device-icon-img {
  display: block;
  width: 68rpx;
  height: 68rpx;
}
.device-rack {
  width: 100%;
  height: 14rpx;
  box-sizing: border-box;
  border-radius: 999rpx;
  border: 2rpx solid #49a0ff;
  background: rgba(73,160,255,0.08);
}
.device-rack::before {
  content: '';
  position: absolute;
  left: 6rpx;
  top: 50%;
  width: 4rpx;
  height: 4rpx;
  border-radius: 50%;
  background: #49a0ff;
  transform: translateY(-50%);
}
.device-name {
  font-size: 30rpx !important;
  font-weight: 900 !important;
  letter-spacing: 0 !important;
  word-break: break-all;
}
.device-card.offline {
  opacity: 0.58;
}
.device-card.offline .summary-chip,
.device-card.offline .feature-button {
  filter: saturate(0.45);
}
</style>
