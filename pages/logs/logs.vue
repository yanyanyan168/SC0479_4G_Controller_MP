<template>
  <view class="page">
    <view class="topbar">
      <view class="back" @click="goBack">‹</view>
      <view class="title">调试日志</view>
      <view></view>
    </view>

    <view class="toolbar">
      <button class="tool-button" @click="clearLogs">清空日志</button>
      <button class="tool-button" @click="toggleMockMode">{{ state.mqtt.mockMode ? '关闭模拟' : '开启模拟' }}</button>
      <button class="tool-button" @click="injectStatus">模拟状态</button>
      <button class="tool-button" @click="injectAck">模拟 ACK</button>
    </view>

    <view class="pending-card">待确认命令：{{ state.pendingSeqList.length }} 条</view>

    <view v-if="!state.logs.length" class="empty">暂无日志</view>
    <view v-for="item in state.logs" :key="item.id" class="log-card">
      <view class="meta">{{ item.timeText }} · {{ item.direction }} · {{ item.cmd || '—' }}</view>
      <view class="meta">{{ item.devId || '—' }} · seq={{ item.seq || '—' }} · {{ item.result || '—' }}</view>
      <view class="topic">{{ item.topic }}</view>
      <view class="payload">{{ item.payloadText }}</view>
    </view>
  </view>
</template>

<script setup>
import { deviceStore } from '@/store/deviceStore.js'
import { mqttClient } from '@/common/mqttClient.js'

const state = deviceStore.state
function goBack() { uni.navigateBack() }
function clearLogs() { deviceStore.clearLogs() }
function toggleMockMode() { mqttClient.setMockMode(!state.mqtt.mockMode) }
function injectStatus() { mqttClient.injectMockStatusReport() }
function injectAck() {
  if (!mqttClient.injectLatestPendingAck()) uni.showToast({ title: '没有待确认命令', icon: 'none' })
}
</script>

<style scoped>
page { background: #020817; }
button::after { border: none; }
.page { min-height: 100vh; padding: calc(var(--status-bar-height) + 18rpx) 24rpx calc(70rpx + env(safe-area-inset-bottom)); box-sizing: border-box; background: #020817; color: #eef4ff; }
.topbar { height: 72rpx; display: grid; grid-template-columns: 70rpx 1fr 70rpx; align-items: center; }
.back { font-size: 58rpx; color: #9caecc; }
.title { text-align: center; font-size: 32rpx; font-weight: 900; }
.toolbar { margin: 26rpx 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12rpx; }
.tool-button { height: 64rpx; display: flex; align-items: center; justify-content: center; border-radius: 16rpx; background: #182740; color: #9bb9e8; font-size: 22rpx; }
.pending-card { padding: 20rpx; border-radius: 18rpx; background: #111c32; color: #8296b6; }
.empty { padding: 80rpx 0; text-align: center; color: #657894; }
.log-card { margin-top: 18rpx; padding: 20rpx; border-radius: 20rpx; background: #111c32; border: 1rpx solid #253650; }
.meta, .topic { color: #7186a6; font-size: 20rpx; line-height: 1.6; word-break: break-all; }
.payload { margin-top: 14rpx; padding: 16rpx; border-radius: 14rpx; background: #050c1c; color: #c8d6ec; font-size: 20rpx; white-space: pre-wrap; word-break: break-all; }
</style>
