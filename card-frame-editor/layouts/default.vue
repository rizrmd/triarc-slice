<template>
  <div class="h-screen w-screen bg-[#0f0f0f] text-gray-200 overflow-hidden flex flex-col font-mono">
    <header class="h-14 border-b border-[#2a2a2a] flex items-center px-4 justify-between bg-[#1a1a1a]">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-bold text-[#e85d04]">Card Frame Editor</h1>
      </div>
      <div class="flex items-center gap-2">
        <button 
          @click="saveJson"
          class="bg-[#2a2a2a] hover:bg-[#333] text-gray-200 px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[#333]"
        >
          Save to Project
        </button>
      </div>
    </header>
    <main class="flex-1 flex overflow-hidden">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useCardStore } from '~/stores/card'

const store = useCardStore()

const saveJson = async () => {
  try {
    const { success, path } = await $fetch('/api/save', {
      method: 'POST',
      body: store.card
    })
    if (success) {
      alert(`Card saved to ${path}`)
    }
  } catch (e) {
    console.error('Failed to save card', e)
    alert('Failed to save card')
  }
}
</script>

<style>
body {
  margin: 0;
  background-color: #0f0f0f;
}
</style>
