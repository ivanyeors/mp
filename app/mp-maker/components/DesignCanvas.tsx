"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useDesign } from "./DesignProvider"

export function DesignCanvas() {
  // outerRef is the full responsive area (masked by the pillow)
  const outerRef = React.useRef<HTMLDivElement | null>(null)
  // containerRef is the base design coordinate system (664x374) that we scale uniformly
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const { items, setItems, selectedId, setSelectedId } = useDesign()
  const BASE_WIDTH = 664
  const BASE_HEIGHT = 374
  const [canvasScale, setCanvasScale] = React.useState<number>(1)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const dragOffsetRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [rotatingId, setRotatingId] = React.useState<string | null>(null)
  const rotateStartRef = React.useRef<{ cx: number; cy: number; startAngle: number; initialRotation: number } | null>(null)
  const [scalingId, setScalingId] = React.useState<string | null>(null)
  const scaleStartRef = React.useRef<{ cx: number; cy: number; startDist: number; initialScale: number } | null>(null)

  // Measure the available space and compute uniform scale for the base canvas
  React.useEffect(() => {
    if (!outerRef.current) return
    const el = outerRef.current
    const updateScale = () => {
      const rect = el.getBoundingClientRect()
      const scale = Math.max(0.0001, Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT))
      setCanvasScale(scale)
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [])

  const onPointerDownItem = (
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    e.stopPropagation()
    const base = containerRef.current
    if (!base) return
    const baseRect = base.getBoundingClientRect()
    const item = items.find((i) => i.id === id)
    if (!item) return
    setSelectedId(id)
    setDraggingId(id)
    // Convert pointer to container space
    const pxScaled = e.clientX - baseRect.left
    const pyScaled = e.clientY - baseRect.top
    const px = pxScaled / canvasScale
    const py = pyScaled / canvasScale
    dragOffsetRef.current = { x: px - item.x, y: py - item.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setSelectedId(null)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const base = containerRef.current
    if (!base) return
    const baseRect = base.getBoundingClientRect()

    // Handle rotation if active
    if (rotatingId && rotateStartRef.current) {
      const { cx, cy, startAngle, initialRotation } = rotateStartRef.current
      const pxScaled = e.clientX - baseRect.left
      const pyScaled = e.clientY - baseRect.top
      const px = pxScaled / canvasScale
      const py = pyScaled / canvasScale
      const angle = Math.atan2(py - cy, px - cx) * (180 / Math.PI)
      const delta = angle - startAngle
      const newRotation = initialRotation + delta
      setItems((prev) => prev.map((it) => (it.id === rotatingId ? { ...it, r: newRotation } : it)))
      return
    }

    // Handle uniform scaling if active
    if (scalingId && scaleStartRef.current) {
      const { cx, cy, startDist, initialScale } = scaleStartRef.current
      const pxScaled = e.clientX - baseRect.left
      const pyScaled = e.clientY - baseRect.top
      const px = pxScaled / canvasScale
      const py = pyScaled / canvasScale
      const dist = Math.hypot(px - cx, py - cy)
      const ratio = dist / (startDist || 1)
      const nextScale = Math.max(0.1, Math.min(5, initialScale * ratio))
      setItems((prev) => prev.map((it) => (it.id === scalingId ? { ...it, s: nextScale } : it)))
      return
    }

    if (!draggingId) return
    const pxScaled = e.clientX - baseRect.left
    const pyScaled = e.clientY - baseRect.top
    const px = pxScaled / canvasScale
    const py = pyScaled / canvasScale
    const { x: ox, y: oy } = dragOffsetRef.current
    const nx = px - ox
    const ny = py - oy
    setItems((prev) =>
      prev.map((it) => (it.id === draggingId ? { ...it, x: nx, y: ny } : it)),
    )
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingId) {
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
    setDraggingId(null)
    setRotatingId(null)
    rotateStartRef.current = null
    setScalingId(null)
    scaleStartRef.current = null
  }

  const onPointerDownRotate = (
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
    boundsEl: HTMLDivElement | null,
  ) => {
    if (!boundsEl || !containerRef.current) return
    const baseRect = containerRef.current.getBoundingClientRect()
    const rect = boundsEl.getBoundingClientRect()
    const cxScaled = rect.left - baseRect.left + rect.width / 2
    const cyScaled = rect.top - baseRect.top + rect.height / 2
    const cx = cxScaled / canvasScale
    const cy = cyScaled / canvasScale
    const pxScaled = e.clientX - baseRect.left
    const pyScaled = e.clientY - baseRect.top
    const px = pxScaled / canvasScale
    const py = pyScaled / canvasScale
    const startAngle = Math.atan2(py - cy, px - cx) * (180 / Math.PI)
    const item = items.find((i) => i.id === id)
    const initialRotation = item?.r ?? 0
    setRotatingId(id)
    rotateStartRef.current = { cx, cy, startAngle, initialRotation }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    e.stopPropagation()
  }

  const onPointerDownScale = (
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
    boundsEl: HTMLDivElement | null,
  ) => {
    if (!boundsEl || !containerRef.current) return
    const baseRect = containerRef.current.getBoundingClientRect()
    const rect = boundsEl.getBoundingClientRect()
    const cxScaled = rect.left - baseRect.left + rect.width / 2
    const cyScaled = rect.top - baseRect.top + rect.height / 2
    const cx = cxScaled / canvasScale
    const cy = cyScaled / canvasScale
    const pxScaled = e.clientX - baseRect.left
    const pyScaled = e.clientY - baseRect.top
    const px = pxScaled / canvasScale
    const py = pyScaled / canvasScale
    const startDist = Math.hypot(px - cx, py - cy)
    const item = items.find((i) => i.id === id)
    const initialScale = item?.s ?? 1
    setScalingId(id)
    scaleStartRef.current = { cx, cy, startDist, initialScale }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    e.stopPropagation()
  }

  return (
    <div className="absolute inset-0" ref={outerRef} onPointerUp={onPointerUp} onPointerMove={onPointerMove}>
      {/* Center the base coordinate canvas and scale it uniformly */}
      <div
        ref={containerRef}
        className="absolute"
        onPointerDown={onBackgroundPointerDown}
        role="application"
        aria-label="Design canvas"
        style={{
          left: "50%",
          top: "50%",
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${canvasScale})`,
          transformOrigin: "50% 50%",
        }}
      >
        <div className="relative w-full h-full">
          {items
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((item) => (
              <div
                key={item.id}
                className={cn("absolute cursor-grab active:cursor-grabbing")}
                style={{ left: item.x, top: item.y, zIndex: item.z }}
                onPointerDown={(e) => onPointerDownItem(e, item.id)}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedId(item.id)
                }}
              >
                <div
                  className="relative"
                  style={{ transform: `rotate(${item.r || 0}deg) scale(${item.s || 1})`, transformOrigin: "50% 50%" }}
                >
                  <img src={item.src} alt={item.name} draggable={false} />

                  {selectedId === item.id && (
                    <ItemBoundingBox
                      id={item.id}
                      onPointerDownRotate={onPointerDownRotate}
                      onPointerDownScale={onPointerDownScale}
                    />
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function ItemBoundingBox({
  id,
  onPointerDownRotate,
  onPointerDownScale,
}: {
  id: string
  onPointerDownRotate: (
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
    boundsEl: HTMLDivElement | null,
  ) => void
  onPointerDownScale: (
    e: React.PointerEvent<HTMLDivElement>,
    id: string,
    boundsEl: HTMLDivElement | null,
  ) => void
}) {
  const boundsRef = React.useRef<HTMLDivElement | null>(null)
  return (
    <div ref={boundsRef} className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0 border border-sky-500/70 rounded-sm" />

      {/* Edge uniform scale overlays (span full edge) */}
      <div
        className="absolute -top-2 left-0 right-0 h-4 pointer-events-auto z-0"
        style={{ cursor: "ns-resize" }}
        onPointerDown={(e) => onPointerDownScale(e, id, boundsRef.current)}
        title="Scale"
      />
      <div
        className="absolute -bottom-2 left-0 right-0 h-4 pointer-events-auto z-0"
        style={{ cursor: "ns-resize" }}
        onPointerDown={(e) => onPointerDownScale(e, id, boundsRef.current)}
        title="Scale"
      />
      <div
        className="absolute top-0 bottom-0 -left-2 w-4 pointer-events-auto z-0"
        style={{ cursor: "ew-resize" }}
        onPointerDown={(e) => onPointerDownScale(e, id, boundsRef.current)}
        title="Scale"
      />
      <div
        className="absolute top-0 bottom-0 -right-2 w-4 pointer-events-auto z-0"
        style={{ cursor: "ew-resize" }}
        onPointerDown={(e) => onPointerDownScale(e, id, boundsRef.current)}
        title="Scale"
      />

      {/* Corner rotation handles with generous hit areas (above edges) */}
      <div
        className="absolute -top-3 -left-3 w-6 h-6 pointer-events-auto flex items-center justify-center z-10"
        style={{ cursor: "url(/cursor-rotate-nw.svg) 12 12, nwse-resize" }}
        onPointerDown={(e) => onPointerDownRotate(e, id, boundsRef.current)}
        title="Rotate"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow" />
      </div>
      <div
        className="absolute -top-3 -right-3 w-6 h-6 pointer-events-auto flex items-center justify-center z-10"
        style={{ cursor: "url(/cursor-rotate-ne.svg) 12 12, nesw-resize" }}
        onPointerDown={(e) => onPointerDownRotate(e, id, boundsRef.current)}
        title="Rotate"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow" />
      </div>
      <div
        className="absolute -bottom-3 -right-3 w-6 h-6 pointer-events-auto flex items-center justify-center z-10"
        style={{ cursor: "url(/cursor-rotate-se.svg) 12 12, nwse-resize" }}
        onPointerDown={(e) => onPointerDownRotate(e, id, boundsRef.current)}
        title="Rotate"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow" />
      </div>
      <div
        className="absolute -bottom-3 -left-3 w-6 h-6 pointer-events-auto flex items-center justify-center z-10"
        style={{ cursor: "url(/cursor-rotate-sw.svg) 12 12, nesw-resize" }}
        onPointerDown={(e) => onPointerDownRotate(e, id, boundsRef.current)}
        title="Rotate"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow" />
      </div>
    </div>
  )
}

export default DesignCanvas


