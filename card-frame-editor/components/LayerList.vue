<template>
  <div class="flex flex-col h-full bg-[#1a1a1a]">
    <h3 class="text-xs font-semibold text-gray-400 uppercase p-2 border-b border-[#2a2a2a]">Layers</h3>
    <div class="flex-1 overflow-y-auto">
      <div 
        v-for="element in sortedElements" 
        :key="element.id"
        :class="['flex items-center justify-between p-2 cursor-pointer hover:bg-[#2a2a2a] border-b border-[#2a2a2a]', 
                 element.id === store.selectedElementId ? 'bg-[#2a2a2a] border-l-2 border-l-[#e85d04]' : '']"
        @click="store.selectElement(element.id)"
      >
        <div class="flex items-center gap-2 truncate">
          <span class="text-xs text-gray-500 w-4">{{ element.zIndex }}</span>
          <span class="text-sm truncate w-24">{{ element.name || element.type }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button @click.stop="store.toggleVisibility(element.id)" class="text-gray-500 hover:text-white">
            <!-- Eye Icon -->
            <svg v-if="element.visible" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
          </button>
          <button @click.stop="store.removeElement(element.id)" class="text-gray-500 hover:text-red-500">
            <!-- Trash Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCardStore } from '~/stores/card'

const store = useCardStore()
const sortedElements = computed(() => [...store.card.elements].sort((a, b) => b.zIndex - a.zIndex)) // Reverse order for list (top on top)
</script>
