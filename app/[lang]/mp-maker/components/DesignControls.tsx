"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDesign } from "./DesignProvider"
import { RotateCcw, RotateCw } from "lucide-react"

export default function DesignControls() {
  const {
    selectedId,
    groupRotation,
    setGroupRotation,
    rotateGroupBy,
    bringForward,
    sendBackward,
    savePreset,
    resetPreset,
  } = useDesign()
  const [presetName, setPresetName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const onSave = async () => {
    setSaving(true)
    try {
      const name = presetName.trim() || new Date().toLocaleString()
      await Promise.resolve(savePreset(name))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 bg-background/80 backdrop-blur rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rotate Group</span>
        <Button
          size="icon"
          variant="ghost"
          title="Rotate -90°"
          aria-label="Rotate left 90 degrees"
          onClick={() => rotateGroupBy(-90)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <input
          aria-label="Rotate group"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={groupRotation}
          onChange={(e) => setGroupRotation(parseInt(e.target.value, 10))}
          className="w-40 md:w-56"
        />
        <Button
          size="icon"
          variant="ghost"
          title="Rotate +90°"
          aria-label="Rotate right 90 degrees"
          onClick={() => rotateGroupBy(90)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <span className="text-xs w-10 text-right">{groupRotation}°</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">
          {selectedId ? `Selected: ${selectedId}` : "No selection"}
        </div>
        <Button size="sm" variant="secondary" onClick={bringForward} disabled={!selectedId}>
          Bring forward
        </Button>
        <Button size="sm" variant="secondary" onClick={sendBackward} disabled={!selectedId}>
          Send backward
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Preset name (optional)"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
        />
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={resetPreset}>Reset</Button>
      </div>
    </div>
  )
}


