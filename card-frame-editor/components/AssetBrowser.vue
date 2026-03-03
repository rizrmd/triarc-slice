<template>
  <div class="flex flex-col h-full bg-[#1a1a1a]">
    <div class="flex border-b border-[#2a2a2a]">
      <button 
        v-for="tab in ['Cards', 'Assets', 'Uploads']" 
        :key="tab"
        @click="activeTab = tab"
        :class="['flex-1 py-2 text-sm font-medium', activeTab === tab ? 'text-[#e85d04] border-b-2 border-[#e85d04]' : 'text-gray-400 hover:text-gray-200']"
      >
        {{ tab }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <!-- Cards Tab -->
      <div v-if="activeTab === 'Cards'" class="flex flex-col gap-2">
        <div 
          class="p-3 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#333] border border-transparent hover:border-[#e85d04] flex items-center gap-2"
          @click="createNewHeroCard"
        >
          <div class="w-8 h-8 rounded bg-[#e85d04] flex items-center justify-center text-white font-bold">+</div>
          <div class="font-medium text-sm">New Hero Card</div>
        </div>
        
        <div v-if="cards.length > 0" class="text-xs text-gray-500 mt-2 mb-1 uppercase font-bold tracking-wider">Saved Cards</div>
        
        <div 
          v-for="card in cards" 
          :key="card.path"
          class="p-3 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#333] border border-transparent hover:border-[#e85d04]"
          @click="loadCard(card.data)"
        >
          <div class="font-medium text-sm">{{ card.name }}</div>
          <div class="text-xs text-gray-500 truncate opacity-50">{{ card.path.split('/').pop() }}</div>
        </div>
      </div>

      <!-- Assets Tab -->
      <div v-else-if="activeTab === 'Assets'" class="flex flex-col gap-4">
        <div v-for="(group, folder) in groupedAssets" :key="folder">
          <div class="text-xs text-gray-500 mb-2 uppercase font-bold tracking-wider">{{ folder }}</div>
          <div class="grid grid-cols-3 gap-2">
            <div 
              v-for="asset in group" 
              :key="asset.path" 
              class="relative group cursor-grab active:cursor-grabbing aspect-square bg-[#2a2a2a] rounded overflow-hidden border border-transparent hover:border-[#e85d04]"
              draggable="true"
              @dragstart="onDragStart($event, asset)"
            >
              <img :src="asset.path" :alt="asset.name" class="w-full h-full object-cover" />
              <div class="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] p-1 truncate text-white opacity-0 group-hover:opacity-100 transition-opacity">
                {{ asset.name }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="assets.length === 0" class="text-center text-gray-500 py-4 text-xs">
          No assets found in /assets
        </div>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div 
          class="border-2 border-dashed border-[#2a2a2a] rounded p-4 text-center hover:border-[#e85d04] transition-colors cursor-pointer"
          @click="triggerUpload"
          @drop.prevent="handleDrop"
          @dragover.prevent
        >
          <p class="text-xs text-gray-400">Click or drag files here</p>
          <input type="file" ref="fileInput" class="hidden" multiple accept="image/*" @change="handleFileSelect" />
        </div>
        
        <div class="grid grid-cols-3 gap-2">
          <div 
            v-for="upload in uploads" 
            :key="upload.id" 
            class="relative group cursor-grab active:cursor-grabbing aspect-square bg-[#2a2a2a] rounded overflow-hidden border border-transparent hover:border-[#e85d04]"
            draggable="true"
            @dragstart="onDragStart($event, upload)"
          >
            <img :src="upload.src" class="w-full h-full object-cover" />
            <button @click="removeUpload(upload.id)" class="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100">×</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useCardStore } from '~/stores/card'

const store = useCardStore()
const activeTab = ref('Cards')
const assets = ref<{ name: string, path: string, folder: string }[]>([])
const cards = ref<{ name: string, path: string, data: any }[]>([])
const uploads = ref<{ id: string, src: string, name: string }[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const groupedAssets = computed(() => {
  const groups: Record<string, typeof assets.value> = {}
  assets.value.forEach(asset => {
    const folder = asset.folder || 'Root'
    if (!groups[folder]) groups[folder] = []
    groups[folder].push(asset)
  })
  return groups
})

const heroTemplate = {
  name: 'Hero Card',
  description: 'Layered hero layout (BG, Frame, FG, UI)',
  data: {
    name: 'Hero Card',
    dimensions: { width: 750, height: 1050 },
    backgroundColor: '#000000',
    elements: [
      // 1. Character BG (Most behind)
      {
        id: 'hero-bg', type: 'image', name: 'Character BG', src: '', 
        visible: true, locked: false, zIndex: 10, 
        position: { x: 0, y: 0 }, size: { width: 750, height: 1050 }, 
        transform: { rotation: 0, scaleX: 1, scaleY: 1 }, effects: { opacity: 1, blur: 0, tint: { r: 255, g: 255, b: 255, a: 0 } }
      },
      // 2. Card Layer
      {
        id: 'hero-frame', type: 'image', name: 'Card Layer', src: '/hero-frame.webp', 
        visible: true, locked: true, zIndex: 20, 
        position: { x: 0, y: 0 }, size: { width: 750, height: 1050 }, 
        transform: { rotation: 0, scaleX: 1, scaleY: 1 }, effects: { opacity: 1, blur: 0, tint: { r: 255, g: 255, b: 255, a: 0 } }
      },
      // 3. Character FG (Popping out)
      {
        id: 'hero-fg', type: 'image', name: 'Character FG', src: '', 
        visible: true, locked: false, zIndex: 30, 
        position: { x: 75, y: 150 }, size: { width: 600, height: 600 }, 
        transform: { rotation: 0, scaleX: 1, scaleY: 1 }, effects: { opacity: 1, blur: 0, tint: { r: 255, g: 255, b: 255, a: 0 } }
      },
      // 4. UI (Topmost)
      {
        id: 'hero-title', type: 'text', name: 'Card Title', content: 'Hero Name', 
        visible: true, locked: false, zIndex: 40, 
        position: { x: 375, y: 50 }, size: { width: 600, height: 60 }, 
        transform: { rotation: 0, scaleX: 1, scaleY: 1 }, effects: { opacity: 1 },
        textStyle: { fontFamily: 'Arial', fontSize: 48, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' }
      },
      {
        id: 'hero-stats', type: 'text', name: 'Stats', content: 'ATK: 10  DEF: 10', 
        visible: true, locked: false, zIndex: 41, 
        position: { x: 375, y: 950 }, size: { width: 600, height: 40 }, 
        transform: { rotation: 0, scaleX: 1, scaleY: 1 }, effects: { opacity: 1 },
        textStyle: { fontFamily: 'Arial', fontSize: 32, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' }
      }
    ]
  }
}

const createNewHeroCard = () => {
  if (confirm('Create new Hero Card? Unsaved changes will be lost.')) {
    store.loadTemplate(JSON.parse(JSON.stringify(heroTemplate.data)))
  }
}

const loadCard = (cardData: any) => {
  if (confirm('Load card? Unsaved changes will be lost.')) {
    store.loadTemplate(JSON.parse(JSON.stringify(cardData)))
  }
}

// Load assets and cards from API
onMounted(async () => {
  try {
    const [assetsData, cardsData] = await Promise.all([
      $fetch('/api/assets'),
      $fetch('/api/cards')
    ])
    assets.value = assetsData
    cards.value = cardsData
  } catch (e) {
    console.error('Failed to load data', e)
  }
})

const onDragStart = (event: DragEvent, item: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: 'image',
      src: item.path || item.src,
      name: item.name
    }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const files = (event.target as HTMLInputElement).files
  if (files) processFiles(files)
}

const handleDrop = (event: DragEvent) => {
  const files = event.dataTransfer?.files
  if (files) processFiles(files)
}

const processFiles = (files: FileList) => {
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        uploads.value.push({
          id: crypto.randomUUID(),
          src: e.target?.result as string,
          name: file.name
        })
      }
      reader.readAsDataURL(file)
    }
  })
}

const removeUpload = (id: string) => {
  uploads.value = uploads.value.filter(u => u.id !== id)
}
</script>
