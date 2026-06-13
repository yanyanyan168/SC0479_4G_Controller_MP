<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @click="goBack">‹</view>
      <view class="title">连接设置</view>
      <view class="placeholder"></view>
    </view>

    <view class="card">
      <view class="card-title">云端连接</view>
      <view class="status-row">
        <view>
          <view class="status-name">{{ state.mqtt.connected ? '已连接' : '未连接' }}</view>
          <view class="status-sub">{{ state.mqtt.statusText }}</view>
        </view>
        <view class="status-light" :class="state.mqtt.connected ? 'online' : ''"></view>
      </view>
      <view class="button-grid">
        <button class="primary-button" :disabled="connecting || state.mqtt.connected" @click="connectBroker">
          {{ connecting ? '连接中…' : '连接设备' }}
        </button>
        <button class="secondary-button" :disabled="!state.mqtt.connected" @click="disconnectBroker">断开连接</button>
      </view>
    </view>

    <view class="card">
      <view class="card-title">设备信息</view>
      <view class="info-row">
        <text>当前设备</text>
        <text>{{ currentDevice ? currentDevice.name : '未绑定' }}</text>
      </view>
      <view class="info-row">
        <text>设备 ID</text>
        <text>{{ state.currentDeviceId || '—' }}</text>
      </view>
      <view class="info-row">
        <text>固件版本</text>
        <text>{{ state.device.fwVer || '等待设备上报' }}</text>
      </view>
      <view class="info-row no-border">
        <text>已绑定设备</text>
        <text>{{ state.devices.length }} 台</text>
      </view>
    </view>

    <view class="card" v-if="state.ui.debugMode">
      <view class="card-title">高级连接设置</view>
      <view class="field-label">MQTT WebSocket 地址</view>
      <input class="dark-input" v-model="form.wsUrl" placeholder="wss://.../mqtt" />
      <view class="field-label second">Topic 根路径</view>
      <input class="dark-input" v-model="form.topicRoot" placeholder="sc0479" />
      <button class="primary-button save-button" @click="saveSettings">保存设置</button>
      <button class="secondary-button log-button" @click="goLogs">查看调试日志</button>
    </view>

    <view class="quiet-mode-row">
      <text>{{ state.ui.debugMode ? '调试模式' : '用户模式' }}</text>
      <switch color="#2468ff" :checked="state.ui.debugMode" @change="toggleDebugMode" />
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { mqttClient } from '@/common/mqttClient.js'
import { deviceStore } from '@/store/deviceStore.js'

const state = deviceStore.state
const connecting = ref(false)
const currentDevice = computed(() => deviceStore.getCurrentDevice())
const form = reactive({
  wsUrl: state.settings.wsUrl,
  topicRoot: state.settings.topicRoot
})

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
}

function getErrorText(error) {
  return error && error.message ? error.message : '连接失败，请检查网络'
}

async function connectBroker() {
  if (connecting.value || state.mqtt.connected) return
  connecting.value = true
  try {
    await mqttClient.connect()
    uni.showToast({ title: '连接成功', icon: 'none' })
  } catch (error) {
    uni.showToast({ title: getErrorText(error), icon: 'none' })
  } finally {
    connecting.value = false
  }
}

function disconnectBroker() {
  mqttClient.disconnect()
  uni.showToast({ title: '已断开连接', icon: 'none' })
}

function saveSettings() {
  const needReconnect = form.wsUrl !== state.settings.wsUrl || form.topicRoot !== state.settings.topicRoot
  deviceStore.saveSettings(form)
  if (needReconnect && state.mqtt.connected) mqttClient.disconnect()
  uni.showToast({ title: needReconnect ? '已保存，请重新连接' : '设置已保存', icon: 'none' })
}

function toggleDebugMode(event) {
  deviceStore.saveUiSettings({
    ...state.ui,
    debugMode: !!event.detail.value
  })
}

function goLogs() {
  uni.navigateTo({ url: '/pages/logs/logs' })
}
</script>

<style scoped>
page { background: #020817; }
button::after { border: none; }
.page { min-height: 100vh; padding: calc(var(--status-bar-height) + 18rpx) 26rpx calc(80rpx + env(safe-area-inset-bottom)); box-sizing: border-box; background: #020817; color: #f5f8ff; }
.topbar { height: 72rpx; display: grid; grid-template-columns: 70rpx 1fr 70rpx; align-items: center; margin-bottom: 24rpx; }
.back { font-size: 58rpx; color: #9caecc; }
.title { text-align: center; font-size: 32rpx; font-weight: 900; }
.card { margin-bottom: 24rpx; padding: 28rpx; border-radius: 28rpx; background: #111c32; border: 1rpx solid #253650; }
.card-title { margin-bottom: 24rpx; font-size: 30rpx; font-weight: 900; }
.status-row { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 0 30rpx; }
.status-name { font-size: 30rpx; font-weight: 900; }
.status-sub { margin-top: 8rpx; color: #7185a5; font-size: 22rpx; }
.status-light { width: 22rpx; height: 22rpx; border-radius: 50%; background: #64748b; box-shadow: 0 0 0 9rpx rgba(100,116,139,0.13); }
.status-light.online { background: #00dd77; box-shadow: 0 0 0 9rpx rgba(0,221,119,0.13); }
.button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14rpx; }
.primary-button, .secondary-button { height: 76rpx; display: flex; align-items: center; justify-content: center; border-radius: 20rpx; font-size: 25rpx; font-weight: 900; }
.primary-button { background: #2468ff; color: #fff; }
.secondary-button { background: #1b2a44; color: #b9c7dd; border: 1rpx solid #34445f; }
.info-row { min-height: 76rpx; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; border-bottom: 1rpx solid #1d2a42; color: #8fa2c1; font-size: 24rpx; }
.info-row text:last-child { max-width: 62%; color: #f0f5ff; text-align: right; word-break: break-all; }
.info-row.no-border { border: none; }
.field-label { margin-bottom: 12rpx; color: #9badc7; font-size: 23rpx; }
.field-label.second { margin-top: 22rpx; }
.dark-input { height: 76rpx; padding: 0 20rpx; box-sizing: border-box; border-radius: 18rpx; background: #091428; border: 1rpx solid #30415f; color: #fff; font-size: 24rpx; }
.save-button, .log-button { width: 100%; margin-top: 24rpx; }
.log-button { margin-top: 14rpx; }
.quiet-mode-row { margin: 40rpx 12rpx 0; display: flex; align-items: center; justify-content: center; gap: 14rpx; color: #657895; font-size: 20rpx; opacity: 0.55; }
.quiet-mode-row switch { transform: scale(0.72); }
button[disabled] { opacity: 0.4; }
</style>
