import { defineStore } from 'pinia'
import type { CardLayout, CardElement, ElementType, Position, Size } from '~/types'

export const useCardStore = defineStore('card', {
  state: () => ({
    card: {
      id: crypto.randomUUID(),
      name: 'New Card',
      dimensions: { width: 750, height: 1050 },
      elements: [],
      backgroundColor: '#000000'
    } as CardLayout,
    selectedElementId: null as string | null,
    zoom: 0.5,
    showGrid: true,
    snapToGrid: true,
    gridSize: 20
  }),

  getters: {
    selectedElement: (state) => {
      return state.card.elements.find(el => el.id === state.selectedElementId) || null
    },
    sortedElements: (state) => {
      return [...state.card.elements].sort((a, b) => a.zIndex - b.zIndex)
    }
  },

  actions: {
    initialize() {
      // Add frame if empty
      if (this.card.elements.length === 0) {
        this.addElement({
          type: 'image',
          name: 'Frame',
          src: '/hero-frame.webp',
          width: 750,
          height: 1050,
          x: 0,
          y: 0,
          zIndex: 100, // Frame usually on top? Or bottom? Let's say bottom for now, but usually frame is an overlay. 
                       // Actually frame is usually an overlay in card games. Let's set it to 100.
          locked: true
        })
      }
    },

    addElement(options: { 
      type: ElementType, 
      name?: string, 
      src?: string, 
      content?: string, 
      width?: number, 
      height?: number, 
      x?: number, 
      y?: number,
      zIndex?: number,
      locked?: boolean
    }) {
      const id = crypto.randomUUID()
      const zIndex = options.zIndex ?? (this.card.elements.length > 0 ? Math.max(...this.card.elements.map(e => e.zIndex)) + 1 : 1)
      
      const newElement: CardElement = {
        id,
        type: options.type,
        name: options.name || `Element ${this.card.elements.length + 1}`,
        visible: true,
        locked: options.locked || false,
        zIndex,
        position: { x: options.x || 0, y: options.y || 0 },
        size: { width: options.width || 200, height: options.height || 200 },
        transform: { rotation: 0, scaleX: 1, scaleY: 1 },
        effects: { opacity: 1, blur: 0, tint: { r: 255, g: 255, b: 255, a: 0 } },
        src: options.src,
        content: options.content || 'New Text',
        textStyle: options.type === 'text' ? {
          fontFamily: 'Arial',
          fontSize: 24,
          fontWeight: 'normal',
          color: '#ffffff',
          textAlign: 'center'
        } : undefined
      }

      this.card.elements.push(newElement)
      this.selectedElementId = id
    },

    removeElement(id: string) {
      const index = this.card.elements.findIndex(el => el.id === id)
      if (index !== -1) {
        this.card.elements.splice(index, 1)
        if (this.selectedElementId === id) {
          this.selectedElementId = null
        }
      }
    },

    updateElement(id: string, updates: Partial<CardElement> | any) { // using any for nested updates simplicity for now, but ideally explicit
      const element = this.card.elements.find(el => el.id === id)
      if (element) {
        // Deep merge or specific field update
        // For simplicity, we assume updates are top-level or we manually handle nested in components
        // But for nested props like position, size, we should handle them carefully
        
        if (updates.position) element.position = { ...element.position, ...updates.position }
        if (updates.size) element.size = { ...element.size, ...updates.size }
        if (updates.transform) element.transform = { ...element.transform, ...updates.transform }
        if (updates.effects) element.effects = { ...element.effects, ...updates.effects }
        if (updates.textStyle) element.textStyle = { ...element.textStyle, ...updates.textStyle }
        
        // Primitive fields
        if (updates.name !== undefined) element.name = updates.name
        if (updates.visible !== undefined) element.visible = updates.visible
        if (updates.locked !== undefined) element.locked = updates.locked
        if (updates.zIndex !== undefined) element.zIndex = updates.zIndex
        if (updates.src !== undefined) element.src = updates.src
        if (updates.content !== undefined) element.content = updates.content
      }
    },

    selectElement(id: string | null) {
      this.selectedElementId = id
    },

    bringToFront(id: string) {
      const element = this.card.elements.find(el => el.id === id)
      if (element) {
        const maxZ = Math.max(...this.card.elements.map(e => e.zIndex))
        element.zIndex = maxZ + 1
      }
    },

    sendToBack(id: string) {
      const element = this.card.elements.find(el => el.id === id)
      if (element) {
        const minZ = Math.min(...this.card.elements.map(e => e.zIndex))
        element.zIndex = minZ - 1
      }
    },
    
    toggleVisibility(id: string) {
      const element = this.card.elements.find(el => el.id === id)
      if (element) {
        element.visible = !element.visible
      }
    },

    setZoom(val: number) {
      this.zoom = val
    },
    
    toggleGrid() {
      this.showGrid = !this.showGrid
    },
    
    toggleSnap() {
      this.snapToGrid = !this.snapToGrid
    },
    
    loadTemplate(template: CardLayout) {
        // Deep clone to avoid reference issues
        this.card = JSON.parse(JSON.stringify(template))
        // Regenerate IDs to avoid conflicts if imported multiple times? 
        // Or keep IDs if it's a "load" operation.
        // If it's a template, maybe regenerate.
        this.card.id = crypto.randomUUID() 
        this.card.elements.forEach(el => el.id = crypto.randomUUID())
        this.selectedElementId = null
    }
  }
})
