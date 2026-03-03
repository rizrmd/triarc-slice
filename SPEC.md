# Comprehensive Card Frame Editor - Specification

## Project Overview
- **Project Name**: Card Frame Editor
- **Type**: Nuxt.js Web Application
- **Core Functionality**: Visual editor for designing card layouts with drag-and-drop, layers, effects, and JSON export.
- **Target Users**: Game developers / card game designers.

## UI/UX Specification

### Layout Structure
- **Header**: App title, global actions (Export, Reset, Load Template).
- **Main Area**: Three-column layout.
  - **Left Sidebar (Resources)**:
    - Tabs: Templates, Assets (Images/Uploads), Layers.
    - **Templates**: List of predefined card layouts.
    - **Assets**: Library of uploaded images and existing assets (`/characters`, `/actions`, etc.).
    - **Layers**: Draggable list to manage z-index and visibility.
  - **Center Area (Canvas)**:
    - Infinite or scrollable background.
    - **Card Stage**: The actual card area (fixed resolution, e.g., 750x1050 or similar).
    - **Controls**: Zoom, Grid toggle, Snap toggle.
  - **Right Sidebar (Properties)**:
    - Context-aware properties based on selected element.
    - **Common**: Position (X, Y), Size (W, H), Rotation, Opacity.
    - **Image**: Source, Tint (Color Picker + Blend Mode), Blur (Slider).
    - **Text**: Content, Font, Size, Color, Alignment.
    - **Z-Index**: Manual input or "Bring to Front"/"Send to Back" buttons.

### Visual Design
- **Theme**: Dark mode interface (professional creative tool look).
- **Colors**: Dark grays (#1e1e1e, #252526) for panels, bright accent (e.g., #007acc) for selections.
- **Interactions**:
  - Drag and drop from assets to canvas.
  - Drag to move elements on canvas.
  - Resize handles on selected elements.
  - Real-time updates for all property changes.

## Functionality Specification

### Core Features
1.  **Canvas & Grid**:
    - Fixed aspect ratio card frame.
    - Toggleable grid overlay.
    - Snapping to grid and other elements.
2.  **Element Management**:
    - **Types**: Image, Text, Shape (Rectangle/Circle).
    - **Drag & Drop**: Move elements freely.
    - **Resizing**: Drag handles to resize.
    - **Layering**: Z-index control via Layers panel or actions.
3.  **Visual Effects**:
    - **Tinting**: Apply RGBA color overlay to images.
    - **Blur**: Gaussian blur intensity (0-20px).
    - **Opacity**: Global alpha (0-1).
4.  **Asset Management**:
    - **System Assets**: Load from `/characters`, `/actions`, `frame.webp`.
    - **User Uploads**: Drag and drop local files to upload (stored in session/local state).
5.  **Templates**:
    - Pre-defined layouts (e.g., "Creature Card", "Spell Card") that load a set of elements.
6.  **JSON Export**:
    - Generate a standard JSON structure.
    - **Schema**:
      ```json
      {
        "id": "uuid",
        "name": "Card Name",
        "dimensions": { "width": 750, "height": 1050 },
        "elements": [
          {
            "id": "uuid",
            "type": "image",
            "name": "Character Art",
            "src": "characters/hero.png",
            "position": { "x": 100, "y": 200 },
            "size": { "width": 400, "height": 400 },
            "zIndex": 1,
            "effects": {
              "tint": { "r": 255, "g": 0, "b": 0, "a": 0.5 },
              "blur": 2
            },
            "transform": { "rotation": 0, "scaleX": 1, "scaleY": 1 }
          },
          {
            "type": "text",
            "content": "Attack: 10",
            "style": { "font": "Arial", "size": 24, "color": "#FFFFFF" },
            ...
          }
        ]
      }
      ```

## Technical Constraints
- **Framework**: Nuxt 3 (Vue 3).
- **State Management**: Pinia.
- **Styling**: Tailwind CSS.
- **Icons**: Lucide-vue or Heroicons.
- **Performance**: Handle 50+ elements without lag.
