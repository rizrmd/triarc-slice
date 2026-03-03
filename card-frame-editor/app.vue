<template>
  <NuxtLayout>
    <div class="flex flex-1 w-full h-full">
      <!-- Left Sidebar: Assets & Layers -->
      <aside class="w-[300px] bg-[#1a1a1a] border-r border-[#2a2a2a] flex flex-col">
        <AssetBrowser />
        <div class="h-[1px] bg-[#2a2a2a] my-2"></div>
        <LayerList />
      </aside>

      <!-- Center: Canvas -->
      <section class="flex-1 bg-[#0f0f0f] relative overflow-hidden flex items-center justify-center">
        <CardCanvas />
      </section>

      <!-- Right Sidebar: Properties -->
      <aside class="w-[300px] bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col overflow-y-auto">
        <PropertiesPanel />
      </aside>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import AssetBrowser from '~/components/AssetBrowser.vue'
import LayerList from '~/components/LayerList.vue'
import CardCanvas from '~/components/CardCanvas.vue'
import PropertiesPanel from '~/components/PropertiesPanel.vue'

// Initialize default card/frame on mount
const store = useCardStore()
onMounted(() => {
  store.initialize()
})
</script>
