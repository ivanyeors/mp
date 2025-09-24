"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useDesign } from "./DesignProvider"

export default function DesignControls() {
  const {
    selectedId,
    groupRotation,
    setGroupRotation,
    bringForward,
    sendBackward,
    savePreset,
    resetPreset,
  } = useDesign()
  const [presetName, setPresetName] = React.useState("")

  return (
    <div className="flex flex-col gap-2 bg-background/80 backdrop-blur rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rotate Group</span>
        <input
          aria-label="Rotate group"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={groupRotation}
          onChange={(e) => setGroupRotation(parseInt(e.target.value, 10))}
        />
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
        <Button size="sm" onClick={savePreset}>Save</Button>
        <Button size="sm" variant="outline" onClick={resetPreset}>Reset</Button>
      </div>
    </div>
  )
}


