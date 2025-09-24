"use client"

import * as React from "react"
import { MenubarItem, MenubarLabel, MenubarSeparator, MenubarSub, MenubarSubContent, MenubarSubTrigger } from "@/components/ui/menubar"
import { useDesign } from "./DesignProvider"

export default function SavedDesignsMenu() {
  const { applyPresetFromServer } = useDesign() as any
  const [configs, setConfigs] = React.useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/mp-maker/configs", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load configs")
      setConfigs((json.configs ?? []).map((c: any) => ({ id: c.id, name: c.name })))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <MenubarSub>
      <MenubarSubTrigger>Saved Designs</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarLabel inset>Choose a design</MenubarLabel>
        <MenubarSeparator />
        {loading && <MenubarItem disabled>Loading…</MenubarItem>}
        {error && <MenubarItem disabled>Error: {error}</MenubarItem>}
        {!loading && !error && configs.length === 0 && (
          <MenubarItem disabled>No saved designs</MenubarItem>
        )}
        {!loading && !error && configs.map((c) => (
          <MenubarItem key={c.id} onClick={() => applyPresetFromServer(c.name)}>
            {c.name}
          </MenubarItem>
        ))}
        <MenubarSeparator />
        <MenubarItem onClick={refresh}>Refresh</MenubarItem>
      </MenubarSubContent>
    </MenubarSub>
  )
}
