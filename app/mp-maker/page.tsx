"use client";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { DotPattern } from "@/components/ui/shadcn-io/dot-pattern";
import MpMakerSidebar from "./components/Sidebar";
import DesignCanvas from "./components/DesignCanvas";
import { DesignProvider } from "./components/DesignProvider";
import DesignControls from "./components/DesignControls";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  FileText,
  Palette,
  Scissors,
  Save,
  Download,
  Upload,
  RotateCcw,
  Eye,
  Share,
} from "lucide-react";
 

export default function MpMakerPage() {
  return (
    <SidebarProvider>
    <DesignProvider>
    <div className="min-h-screen bg-background relative">
      {/* Subtle Dot Pattern Background */}
      <DotPattern
        dotSize={3}
        gap={32}
        baseColor="#3992C3"
        activeColor="#3992C3"
        proximity={80}
        shockRadius={250}
        className="absolute inset-0 opacity-60 pointer-events-none"
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex h-14 items-center px-4">
        {/* Menu Bar */}
        <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <FileText className="mr-2 h-4 w-4" />
                  New Design
                  <MenubarShortcut>⌘N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Upload className="mr-2 h-4 w-4" />
                  Open Design
                  <MenubarShortcut>⌘O</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                  <MenubarShortcut>⌘S</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Download className="mr-2 h-4 w-4" />
                  Export Design
                  <MenubarShortcut>⌘E</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Share className="mr-2 h-4 w-4" />
                  Share Design
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Design</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <Palette className="mr-2 h-4 w-4" />
                  Color Picker
                  <MenubarShortcut>⌘P</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Scissors className="mr-2 h-4 w-4" />
                  Shape Tools
                  <MenubarShortcut>⌘T</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Undo
                  <MenubarShortcut>⌘Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                  <MenubarShortcut>⌘R</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Materials</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Fabric Selection</MenubarItem>
                <MenubarItem>Thread Colors</MenubarItem>
                <MenubarItem>Filling Options</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Size Templates</MenubarItem>
                <MenubarItem>Custom Dimensions</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Help</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Getting Started</MenubarItem>
                <MenubarItem>Tutorial Videos</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Keyboard Shortcuts</MenubarItem>
                <MenubarItem>About</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>
      <MpMakerSidebar />
      {/* Main Content */}
      <SidebarInset className="p-0">
        <div className="fixed inset-0 z-0">
          {/* Full-screen ballpit masked to pillow shape */}
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
          >
            <div
              className="relative"
              style={{
                aspectRatio: '664 / 374',
                width: 'min(80vmin, 900px)',
                WebkitMaskImage: 'url(/pillow-shape.svg)',
                maskImage: 'url(/pillow-shape.svg)',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
              }}
            >
              {/* Design canvas for draggable SVGs, rotates with the group */}
              <DesignCanvas />
              
              {/* Inner shadow overlay */}
              <svg
                className="absolute inset-0 pointer-events-none"
                viewBox="0 0 664 374"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <filter
                    id="innerShadow"
                    x="-30%"
                    y="-30%"
                    width="160%"
                    height="160%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
                    <feOffset dx="0" dy="2" result="offsetBlur" />
                    <feComposite
                      in="offsetBlur"
                      in2="SourceAlpha"
                      operator="arithmetic"
                      k2="-1"
                      k3="1"
                      result="innerShadow"
                    />
                    <feColorMatrix
                      in="innerShadow"
                      type="matrix"
                      values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0"
                      result="shadowColor"
                    />
                  </filter>
                </defs>
                <path
                  d="M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z"
                  fill="white"
                  filter="url(#innerShadow)"
                />
              </svg>
              <svg
                className="absolute inset-0 pointer-events-none"
                viewBox="0 0 664 374"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
              >
                <path
                  d="M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>
        </div>
      </SidebarInset>
      {/* Controls outside the SVG/mask group, over page UI */}
      <div className="fixed right-4 bottom-4 z-20">
        <DesignControls />
      </div>
      </div>
    </div>
    </DesignProvider>
    </SidebarProvider>
  );
}
