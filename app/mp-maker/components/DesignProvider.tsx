"use client"

import * as React from "react"

export type DesignItem = {
  id: string
  name: string
  src: string
  x: number
  y: number
  z: number
  r: number // rotation in degrees
  s: number // uniform scale (1 = original)
}

export type Preset = {
  items: DesignItem[]
  groupRotation: number
}

const DEFAULT_ITEMS: DesignItem[] = [
  { id: "corner", name: "Corner", src: "/Corner.svg", x: 40, y: 40, z: 1, r: 0, s: 1 },
  { id: "fold", name: "Fold", src: "/Fold.svg", x: 220, y: 60, z: 2, r: 0, s: 1 },
  { id: "lplus", name: "L-plus", src: "/L-plus.svg", x: 140, y: 120, z: 3, r: 0, s: 1 },
  { id: "l", name: "L", src: "/L.svg", x: 320, y: 160, z: 4, r: 0, s: 1 },
]

const PRESET_KEY = "mp-maker:preset:v1"

type DesignContextValue = {
  items: DesignItem[]
  setItems: React.Dispatch<React.SetStateAction<DesignItem[]>>
  selectedId: string | null
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>
  groupRotation: number
  setGroupRotation: React.Dispatch<React.SetStateAction<number>>
  rotateGroupBy: (deltaDegrees: number) => void
  bringForward: () => void
  sendBackward: () => void
  savePreset: (name?: string) => void
  resetPreset: () => void
  applyPresetFromServer: (name: string) => void
}

const DesignContext = React.createContext<DesignContextValue | null>(null)

export function useDesign() {
  const ctx = React.useContext(DesignContext)
  if (!ctx) throw new Error("useDesign must be used within DesignProvider")
  return ctx
}

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<DesignItem[]>(DEFAULT_ITEMS)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [groupRotation, setGroupRotation] = React.useState<number>(0)

  const normalizeAngle = React.useCallback((angle: number) => {
    const wrapped = ((angle % 360) + 360) % 360
    return wrapped > 180 ? wrapped - 360 : wrapped
  }, [])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_KEY)
      if (raw) {
        const parsed: Preset = JSON.parse(raw)
        if (Array.isArray(parsed.items)) {
          // Migrate older presets by adding missing rotation
          const migrated = parsed.items.map((it: any) => ({
            r: 0,
            s: 1,
            ...it,
          })) as DesignItem[]
          setItems(migrated)
        }
        if (typeof parsed.groupRotation === "number") setGroupRotation(parsed.groupRotation)
      }
    } catch {}
  }, [])

  const bringForward = React.useCallback(() => {
    if (!selectedId) return
    setItems((prev) => {
      const maxZ = Math.max(...prev.map((i) => i.z))
      return prev.map((i) => (i.id === selectedId ? { ...i, z: maxZ + 1 } : i))
    })
  }, [selectedId])

  const sendBackward = React.useCallback(() => {
    if (!selectedId) return
    setItems((prev) => {
      const minZ = Math.min(...prev.map((i) => i.z))
      return prev.map((i) => (i.id === selectedId ? { ...i, z: minZ - 1 } : i))
    })
  }, [selectedId])

  const rotateGroupBy = React.useCallback((deltaDegrees: number) => {
    setGroupRotation((prev) => normalizeAngle(prev + deltaDegrees))
  }, [normalizeAngle])

  const savePreset = React.useCallback((name?: string) => {
    const preset: Preset = { items, groupRotation }
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(preset))
    } catch {}
    if (name && typeof window !== "undefined") {
      // Fire-and-forget sync to server
      fetch("/api/mp-maker/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: preset }),
      }).catch(() => {})
    }
  }, [items, groupRotation])

  const applyPresetFromServer = React.useCallback((name: string) => {
    ;(async () => {
      try {
        const res = await fetch(`/api/mp-maker/configs/${encodeURIComponent(name)}`, { cache: "no-store" })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load config")
        const data = json.config?.data as Preset | undefined
        if (data && Array.isArray(data.items)) {
          const migrated = data.items.map((it: any) => ({ r: 0, s: 1, ...it })) as DesignItem[]
          setItems(migrated)
          if (typeof data.groupRotation === "number") setGroupRotation(data.groupRotation)
          setSelectedId(null)
          try { localStorage.setItem(PRESET_KEY, JSON.stringify({ items: migrated, groupRotation: data.groupRotation ?? 0 })) } catch {}
        }
      } catch {}
    })()
  }, [])

  const resetPreset = React.useCallback(() => {
    setItems(DEFAULT_ITEMS)
    setGroupRotation(0)
    setSelectedId(null)
  }, [])

  const value: DesignContextValue = React.useMemo(
    () => ({
      items,
      setItems,
      selectedId,
      setSelectedId,
      groupRotation,
      setGroupRotation,
      rotateGroupBy,
      bringForward,
      sendBackward,
      savePreset,
      resetPreset,
      applyPresetFromServer,
    }),
    [items, selectedId, groupRotation, bringForward, sendBackward, savePreset, resetPreset, applyPresetFromServer, rotateGroupBy],
  )

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>
}


