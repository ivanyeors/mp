"use client"

import * as React from "react"
import { Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type InputCardProps = {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

function InputCard({ label, value, onChange, className }: InputCardProps) {
  return (
    <div className={cn("", className)}>
      <h3 className="text-2xl font-semibold tracking-tight mb-1">{label}</h3>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 text-3xl md:text-3xl font-semibold tracking-tight placeholder:text-3xl"
        placeholder="0"
      />
    </div>
  )
}

export default function MpMakerSidebar() {
  const [shoulderLength, setShoulderLength] = React.useState("")
  const [neckToBack, setNeckToBack] = React.useState("")
  const [headToBack, setHeadToBack] = React.useState("")
  const [neckLength, setNeckLength] = React.useState("")
  const { toggleSidebar } = useSidebar()

  return (
    <Sidebar side="right" variant="inset" collapsible="icon" className="p-0">
      <SidebarRail />

      <SidebarHeader className="px-3 group-data-[collapsible=icon]:hidden">
        <div className="text-sm font-medium">Maker Panel</div>
      </SidebarHeader>
      <SidebarSeparator className="mx-0 group-data-[collapsible=icon]:hidden" />

      <SidebarContent className="p-3 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center">
        <SidebarGroup className="p-0 group-data-[collapsible=icon]:flex-1">
          {/* Removed Measurements label for cleaner UI */}
          <SidebarGroupContent className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center">
            {/* Expanded view: large input cards */}
            <div className="hidden group-data-[collapsible=icon]:hidden md:block" />
            <div className="flex flex-col gap-3 p-0 group-data-[collapsible=icon]:hidden">
              <InputCard
                label="Shoulder Length"
                value={shoulderLength}
                onChange={setShoulderLength}
              />
              <InputCard
                label="Neck to Back"
                value={neckToBack}
                onChange={setNeckToBack}
              />
              <InputCard
                label="Head to Back"
                value={headToBack}
                onChange={setHeadToBack}
              />
              <InputCard
                label="Neck Length"
                value={neckLength}
                onChange={setNeckLength}
              />

              <SidebarSeparator className="mx-0 mt-3" />
              <SidebarMenu className="p-0">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Inventory → Shopify Admin">
                    <a href="/settings/inventory/shopify">
                      <Settings />
                      <span>Inventory · Shopify Admin</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>

            {/* Minimized single-gear icon to expand */}
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:pt-4 flex-col gap-1 p-0">
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Open panel"
                  onClick={toggleSidebar}
                  className="group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                >
                  <Settings />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
