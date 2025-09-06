import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
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
    <div className="min-h-screen bg-background">
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

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Mpillow Maker
            </h1>
            <p className="text-lg text-muted-foreground">
              Design and customize your perfect pillow. Choose fabrics, colors, and sizes to create something unique.
            </p>
          </div>

          {/* Placeholder for design canvas */}
          <div className="bg-card border-2 border-dashed border-muted-foreground/25 rounded-lg h-96 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Palette className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Design Canvas</h3>
              <p className="text-sm">
                Start by selecting &quot;New Design&quot; from the File menu above
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
