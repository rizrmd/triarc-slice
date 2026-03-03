# Tasks

- [ ] **Project Setup**
  - [ ] Initialize Nuxt 3 project in `card-frame-editor/`.
  - [ ] Install Tailwind CSS, Pinia, VueUse (for drag/drop primitives).
  - [ ] Configure `nuxt.config.ts` (imports, modules).
  - [ ] Setup assets folder structure.

- [ ] **Core Architecture & State**
  - [ ] Create `useCardStore` (Pinia) to manage card elements.
  - [ ] Define TypeScript interfaces for `CardElement` (Image, Text), `CardLayout`.
  - [ ] Implement actions: `addElement`, `removeElement`, `updateElement`, `reorderElement`.

- [ ] **UI Components - Layout**
  - [ ] Create `MainLayout.vue` (Sidebar, Canvas, Properties).
  - [ ] Create `AssetBrowser.vue` (Tabs for Templates/Assets).
  - [ ] Create `LayerList.vue` (Draggable list for Z-index).
  - [ ] Create `PropertiesPanel.vue` (Dynamic form based on selection).

- [ ] **Canvas & Interaction**
  - [ ] Create `CardCanvas.vue`.
  - [ ] Implement **Drag & Drop** logic (from sidebar to canvas).
  - [ ] Implement **Element Positioning** (draggable on canvas).
  - [ ] Implement **Selection System** (click to select, click background to deselect).
  - [ ] Implement **Resizing Handles**.

- [ ] **Visual Effects**
  - [ ] Implement `ImageElement.vue` with props for Tint, Blur, Opacity.
  - [ ] Add controls in `PropertiesPanel` for Tint (Color Picker), Blur (Slider).

- [ ] **Advanced Features**
  - [ ] Implement **Grid & Snapping**.
  - [ ] Implement **Templates** (load predefined JSONs).
  - [ ] Implement **Image Upload** (FileReader to DataURL or Blob).

- [ ] **Export**
  - [ ] Create `JSONExport` utility.
  - [ ] Validate output schema.
  - [ ] Add "Export JSON" button to UI.
