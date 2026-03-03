<template>
  <div class="flex flex-col h-full bg-[#1a1a1a] text-xs">
    <div class="p-3 border-b border-[#2a2a2a] font-bold text-gray-400 uppercase">Properties</div>
    
    <div v-if="selectedElement" class="flex-1 overflow-y-auto p-4 space-y-6">
      
      <!-- Common: Transform -->
      <section class="space-y-2">
        <h4 class="font-semibold text-gray-500 mb-2">Transform</h4>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">X</label>
            <input type="number" v-model.number="selectedElement.position.x" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 focus:border-[#e85d04] outline-none" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">Y</label>
            <input type="number" v-model.number="selectedElement.position.y" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 focus:border-[#e85d04] outline-none" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">Width</label>
            <input type="number" v-model.number="selectedElement.size.width" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 focus:border-[#e85d04] outline-none" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">Height</label>
            <input type="number" v-model.number="selectedElement.size.height" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 focus:border-[#e85d04] outline-none" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">Rotation</label>
            <input type="number" v-model.number="selectedElement.transform.rotation" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 focus:border-[#e85d04] outline-none" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-gray-500">Opacity</label>
            <input type="range" min="0" max="1" step="0.1" v-model.number="selectedElement.effects.opacity" class="accent-[#e85d04]" />
          </div>
        </div>
      </section>

      <!-- Layering -->
      <section class="space-y-2">
        <h4 class="font-semibold text-gray-500 mb-2">Layering</h4>
        <div class="flex gap-2">
          <button @click="store.bringToFront(selectedElement.id)" class="flex-1 bg-[#2a2a2a] hover:bg-[#333] py-1 rounded border border-[#333]">To Front</button>
          <button @click="store.sendToBack(selectedElement.id)" class="flex-1 bg-[#2a2a2a] hover:bg-[#333] py-1 rounded border border-[#333]">To Back</button>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <label class="text-gray-500 w-16">Z-Index</label>
          <input type="number" v-model.number="selectedElement.zIndex" class="flex-1 bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 outline-none" />
        </div>
      </section>

      <!-- Image Specific -->
      <section v-if="selectedElement.type === 'image'" class="space-y-4">
        <h4 class="font-semibold text-gray-500 mb-2">Image Effects</h4>
        
        <!-- Blur -->
        <div class="space-y-1">
          <div class="flex justify-between">
            <label class="text-gray-500">Blur</label>
            <span class="text-gray-500">{{ selectedElement.effects?.blur }}px</span>
          </div>
          <input type="range" min="0" max="20" v-model.number="selectedElement.effects.blur" class="w-full accent-[#e85d04]" />
        </div>

        <!-- Tint -->
        <div class="space-y-2">
          <label class="text-gray-500 block">Tint Color</label>
          <div class="flex gap-2 items-center">
            <input type="color" v-model="tintHex" @input="updateTintFromHex" class="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0" />
            <input type="text" v-model="tintHex" @change="updateTintFromHex" class="flex-1 bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 outline-none uppercase" />
          </div>
          <div class="space-y-1">
             <div class="flex justify-between">
              <label class="text-gray-500">Tint Intensity (Alpha)</label>
              <span class="text-gray-500">{{ selectedElement.effects?.tint?.a.toFixed(2) }}</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" v-model.number="selectedElement.effects.tint.a" class="w-full accent-[#e85d04]" />
          </div>
        </div>
      </section>

      <!-- Text Specific -->
      <section v-if="selectedElement.type === 'text'" class="space-y-4">
        <h4 class="font-semibold text-gray-500 mb-2">Typography</h4>
        <div class="space-y-2">
          <textarea v-model="selectedElement.content" rows="3" class="w-full bg-[#2a2a2a] border border-[#333] rounded p-2 outline-none focus:border-[#e85d04]"></textarea>
          
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label class="text-gray-500">Font Size</label>
              <input type="number" v-model.number="selectedElement.textStyle.fontSize" class="bg-[#2a2a2a] border border-[#333] rounded px-2 py-1 outline-none" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-gray-500">Color</label>
              <input type="color" v-model="selectedElement.textStyle.color" class="w-full h-8 bg-transparent" />
            </div>
          </div>
        </div>
      </section>

      <div class="pt-4 border-t border-[#2a2a2a]">
        <button @click="store.removeElement(selectedElement.id)" class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2 rounded border border-red-500/30 transition-colors">
          Delete Element
        </button>
      </div>

    </div>
    <div v-else class="flex-1 flex items-center justify-center text-gray-500 italic p-4 text-center">
      Select an element to edit properties
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCardStore } from '~/stores/card'
import { computed, ref, watch } from 'vue'

const store = useCardStore()
const selectedElement = computed(() => store.selectedElement)

// Helper to sync Hex color with RGBA object in store
const tintHex = ref('#ffffff')

// Convert RGBA to Hex
const rgbaToHex = (r: number, g: number, b: number) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

// Convert Hex to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

// Watch selection to update local hex
watch(() => selectedElement.value?.id, () => {
  if (selectedElement.value?.effects?.tint) {
    const { r, g, b } = selectedElement.value.effects.tint
    tintHex.value = rgbaToHex(r, g, b)
  }
}, { immediate: true })

const updateTintFromHex = () => {
  if (!selectedElement.value) return
  const rgb = hexToRgb(tintHex.value)
  if (rgb) {
    selectedElement.value.effects.tint.r = rgb.r
    selectedElement.value.effects.tint.g = rgb.g
    selectedElement.value.effects.tint.b = rgb.b
    // alpha remains unchanged unless slider is moved
  }
}
</script>
