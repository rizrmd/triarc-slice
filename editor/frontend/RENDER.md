# Card Rendering & Layout Guide

This document explains how the Card rendering system works in the frontend, specifically focusing on `CardPreview` and `CardCanvas`, and provides guidelines to ensure stable layouts and prevent Cumulative Layout Shift (CLS).

## Architecture

The card rendering system uses a **Scale-to-Fit** strategy to ensure the card looks identical regardless of the display size.

### Core Components

1.  **`CardCanvas` (Editor)**
    *   Uses a fixed coordinate system based on the `frame_image` dimensions (or defaults to 400x600).
    *   Handles zooming and panning via CSS transforms.
    *   Layers (`char-bg`, `frame`, `char-fg`) are positioned absolutely within this coordinate system.

2.  **`CardPreview` (Read-only)**
    *   Wraps the card content in a container that listens to size changes via `ResizeObserver`.
    *   Calculates a `scale` factor to fit the *entire* card content into the container (`object-fit: contain` logic).
    *   **Crucial**: The internal content is rendered at its "native" resolution (`baseSize`) and then scaled down.

## Layout Stability Guidelines

To prevent layout shifts (CLS) and ensure proper rendering:

### 1. Parent Container Constraints
The `CardPreview` component expands to fill its parent. Therefore, the **parent container must have a constrained height and width**.

**Bad:**
```tsx
<div>
  <CardPreview slug="hero" /> {/* Will collapse or expand indefinitely */}
</div>
```

**Good:**
```tsx
<div className="h-[300px] w-[200px]">
  <CardPreview slug="hero" />
</div>
```

**Best (Responsive):**
```tsx
<div className="w-full aspect-[2/3] relative">
  <div className="absolute inset-0">
    <CardPreview slug="hero" />
  </div>
</div>
```

### 2. Aspect Ratio Matching
The system assumes a vertical card format (typically 2:3).
*   If the `frame_image` has a different aspect ratio, `CardPreview` will center the card and show background bars (letterboxing) to preserve the card's shape.
*   **Recommendation**: Ensure the parent container's aspect ratio matches the expected card frames (usually 2:3) to minimize empty space.
*   **Reference**: `CardList.tsx` uses `aspect-[2/3]` on the card container to reserve space before the card loads.

### 3. Loading States & CLS
`CardPreview` handles loading internally:
*   Displays a `Loader2` spinner while fetching config.
*   Uses a default `baseSize` of 400x600 until the frame image loads.
*   **Potential Shift**: If the actual frame is significantly different from 2:3 (e.g., a square frame), a layout adjustment will occur once the image loads.
    *   *Mitigation*: Pre-load frame images or ensure consistent frame aspect ratios across the project.
    *   *Mitigation*: The `ResizeObserver` will re-calculate the scale immediately, but a slight visual jump might be perceptible if the network is slow.

### 4. Transform Interactions
Avoid applying CSS `transform` directly to the `CardPreview` component itself if possible, as it internally uses transforms for scaling. Instead, wrap it in a `div` and apply transforms (like hover effects) to the wrapper.

**Example from `CardList.tsx`:**
```tsx
<div className="relative aspect-[2/3] w-full bg-[#1b1e25] overflow-hidden">
  {/* Wrapper for hover effect */}
  <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105 origin-center">
    <CardPreview slug={slug} />
  </div>
</div>
```

## Troubleshooting

If you see layout shifts:
1.  **Check Container**: Verify the parent container has `display: flex` or `grid` constraints, or explicit width/height.
2.  **Verify Frame**: Ensure `frame_image` is accessible and loading correctly. If it fails, the preview falls back to the default frame.
3.  **ResizeObserver**: Ensure `ResizeObserver` is supported in the target environment (modern browsers support it by default).
