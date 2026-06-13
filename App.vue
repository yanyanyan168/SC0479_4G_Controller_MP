<script>
import { deviceStore } from '@/store/deviceStore.js'
import { mqttClient } from '@/common/mqttClient.js'

export default {
  onLaunch() {
    deviceStore.loadSettings()
    mqttClient.bootstrap()
  }
}
</script>

<style lang="scss">
page {
  background: #020817;
  color: #f5f8ff;
  font-size: 28rpx;
}
view, text, button, input, scroll-view, picker {
  box-sizing: border-box;
}
</style>
