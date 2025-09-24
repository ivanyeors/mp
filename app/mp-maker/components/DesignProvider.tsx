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
  bringForward: () => void
  sendBackward: () => void
  savePreset: () => void
  resetPreset: () => void
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

  const savePreset = React.useCallback(() => {
    const preset: Preset = { items, groupRotation }
    localStorage.setItem(PRESET_KEY, JSON.stringify(preset))
  }, [items, groupRotation])

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
      bringForward,
      sendBackward,
      savePreset,
      resetPreset,
    }),
    [items, selectedId, groupRotation, bringForward, sendBackward, savePreset, resetPreset],
  )

  return <DesignContext.Provider value={value}>{children}</DesignContext.Provider>
}


