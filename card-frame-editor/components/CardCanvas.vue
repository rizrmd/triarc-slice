<template>
  <div 
    class="w-full h-full flex items-center justify-center bg-[#1e1e1e] overflow-auto relative"
    @wheel.ctrl.prevent="handleWheel"
  >
    <!-- Grid Background -->
    <div 
      class="absolute inset-0 pointer-events-none opacity-20"
      :style="{
        backgroundImage: store.showGrid ? `linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)` : 'none',
        backgroundSize: `${store.gridSize * store.zoom}px ${store.gridSize * store.zoom}px`
      }"
    ></div>

    <!-- The Card Stage -->
    <div 
      ref="stageRef"
      class="relative bg-black shadow-2xl transition-transform duration-75 ease-out"
      :style="{
        width: `${store.card.dimensions.width}px`,
        height: `${store.card.dimensions.height}px`,
        transform: `scale(${store.zoom})`,
        transformOrigin: 'center center'
      }"
      @drop.prevent="handleDrop"
      @dragover.prevent
      @click.self="store.selectElement(null)"
    >
      <!-- Render Elements -->
      <div 
        v-for="element in store.sortedElements" 
        :key="element.id"
        class="absolute"
        :style="{
          left: `${element.position.x}px`,
          top: `${element.position.y}px`,
          width: `${element.size.width}px`,
          height: `${element.size.height}px`,
          zIndex: element.zIndex,
          transform: `rotate(${element.transform.rotation}deg) scale(${element.transform.scaleX}, ${element.transform.scaleY})`,
          opacity: element.effects?.opacity ?? 1,
          pointerEvents: element.locked ? 'none' : 'auto',
          display: element.visible ? 'block' : 'none'
        }"
        @mousedown.stop="startDrag($event, element)"
        @drop.stop.prevent="handleElementDrop($event, element)"
        @dragover.prevent
      >
        <!-- Element Content -->
        <img 
          v-if="element.type === 'image' && element.src" 
          :src="element.src" 
          class="w-full h-full object-cover pointer-events-none select-none"
          :style="{
            filter: `blur(${element.effects?.blur || 0}px)`,
            // Tinting is tricky with CSS filter alone. Often requires a wrapper or svg filter.
            // Using a simple overlay for tint:
          }" 
        />
        <div 
          v-else-if="element.type === 'image' && !element.src"
          class="w-full h-full bg-gray-800/50 border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-400 text-xs pointer-events-none select-none p-2 text-center"
        >
          Drop {{ element.name }} Here
        </div>
        
        <!-- Tint Overlay -->
        <div 
          v-if="element.type === 'image' && element.effects?.tint && element.effects.tint.a > 0"
          class="absolute inset-0 pointer-events-none mix-blend-multiply"
          :style="{
            backgroundColor: `rgba(${element.effects.tint.r}, ${element.effects.tint.g}, ${element.effects.tint.b}, ${element.effects.tint.a})`
          }"
        ></div>

        <div 
          v-if="element.type === 'text'"
          class="w-full h-full whitespace-pre-wrap"
          :style="{
            fontFamily: element.textStyle?.fontFamily,
            fontSize: `${element.textStyle?.fontSize}px`,
            fontWeight: element.textStyle?.fontWeight,
            color: element.textStyle?.color,
            textAlign: element.textStyle?.textAlign
          }"
        >
          {{ element.content }}
        </div>

        <!-- Selection Ring & Resize Handles -->
        <div 
          v-if="store.selectedElementId === element.id" 
          class="absolute -inset-[2px] border-2 border-[#e85d04] pointer-events-none"
        >
          <!-- Resize Handles (Corners) -->
          <div class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-[#e85d04] pointer-events-auto cursor-nw-resize" @mousedown.stop="startResize($event, element, 'nw')"></div>
          <div class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-[#e85d04] pointer-events-auto cursor-ne-resize" @mousedown.stop="startResize($event, element, 'ne')"></div>
          <div class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-[#e85d04] pointer-events-auto cursor-sw-resize" @mousedown.stop="startResize($event, element, 'sw')"></div>
          <div class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-[#e85d04] pointer-events-auto cursor-se-resize" @mousedown.stop="startResize($event, element, 'se')"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCardStore } from '~/stores/card'
import type { CardElement } from '~/types'

const store = useCardStore()
const stageRef = ref<HTMLElement | null>(null)

// Zoom Control
const handleWheel = (e: WheelEvent) => {
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newZoom = Math.max(0.1, Math.min(3, store.zoom + delta))
  store.setZoom(newZoom)
}

// Element Drop (Replacing content)
const handleElementDrop = (e: DragEvent, element: CardElement) => {
  const data = e.dataTransfer?.getData('application/json')
  if (data) {
    try {
      const parsed = JSON.parse(data)
      if (element.type === 'image' && parsed.type === 'image' && parsed.src) {
        store.updateElement(element.id, { 
          src: parsed.src,
          // Optional: Update name if it was a placeholder
          name: element.name.includes('BG') || element.name.includes('FG') ? parsed.name : element.name 
        })
      }
    } catch (err) {
      console.error('Invalid drop data', err)
    }
  }
}

// Drag & Drop (Adding new elements)
const handleDrop = (e: DragEvent) => {
  const data = e.dataTransfer?.getData('application/json')
  if (data) {
    try {
      const parsed = JSON.parse(data)
      const rect = stageRef.value?.getBoundingClientRect()
      if (rect) {
        // Calculate relative position accounting for zoom
        const x = (e.clientX - rect.left) / store.zoom
        const y = (e.clientY - rect.top) / store.zoom
        
        store.addElement({
          type: parsed.type,
          src: parsed.src,
          name: parsed.name,
          x: x - 100, // Center roughly (assuming 200x200 default)
          y: y - 100
        })
      }
    } catch (err) {
      console.error('Invalid drop data', err)
    }
  }
}

// Element Dragging
let isDragging = false
let dragStartPos = { x: 0, y: 0 }
let elementStartPos = { x: 0, y: 0 }
let activeElementId: string | null = null

const startDrag = (e: MouseEvent, element: CardElement) => {
  if (element.locked) return
  // store.selectElement(element.id) // Selection disabled on click/drag as per request
  isDragging = true
  activeElementId = element.id
  dragStartPos = { x: e.clientX, y: e.clientY }
  elementStartPos = { x: element.position.x, y: element.position.y }
  
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

const onDrag = (e: MouseEvent) => {
  if (!isDragging || !activeElementId) return
  
  const dx = (e.clientX - dragStartPos.x) / store.zoom
  const dy = (e.clientY - dragStartPos.y) / store.zoom
  
  let newX = elementStartPos.x + dx
  let newY = elementStartPos.y + dy
  
  // Snap to Grid
  if (store.snapToGrid) {
    newX = Math.round(newX / store.gridSize) * store.gridSize
    newY = Math.round(newY / store.gridSize) * store.gridSize
  }
  
  store.updateElement(activeElementId, {
    position: { x: newX, y: newY }
  })
}

const stopDrag = () => {
  isDragging = false
  activeElementId = null
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

// Resizing
let isResizing = false
let resizeHandle = ''
let elementStartSize = { width: 0, height: 0 }

const startResize = (e: MouseEvent, element: CardElement, handle: string) => {
  e.stopPropagation() // Prevent drag start
  isResizing = true
  activeElementId = element.id
  resizeHandle = handle
  dragStartPos = { x: e.clientX, y: e.clientY }
  elementStartPos = { x: element.position.x, y: element.position.y }
  elementStartSize = { width: element.size.width, height: element.size.height }
  
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

const onResize = (e: MouseEvent) => {
  if (!isResizing || !activeElementId) return
  
  const dx = (e.clientX - dragStartPos.x) / store.zoom
  const dy = (e.clientY - dragStartPos.y) / store.zoom
  
  let newWidth = elementStartSize.width
  let newHeight = elementStartSize.height
  let newX = elementStartPos.x
  let newY = elementStartPos.y
  
  // Logic depends on handle
  if (resizeHandle.includes('e')) newWidth += dx
  if (resizeHandle.includes('w')) {
    newWidth -= dx
    newX += dx
  }
  if (resizeHandle.includes('s')) newHeight += dy
  if (resizeHandle.includes('n')) {
    newHeight -= dy
    newY += dy
  }
  
  // Minimum size
  if (newWidth < 10) newWidth = 10
  if (newHeight < 10) newHeight = 10

  // Snap Size? Maybe not for now, or just snap position.
  
  store.updateElement(activeElementId, {
    size: { width: newWidth, height: newHeight },
    position: { x: newX, y: newY }
  })
}

const stopResize = () => {
  isResizing = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}
</script>
