import { MpCareAftercareSection } from "@/components/mp-care/aftercare-section";
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
  Heart,
  Droplets,
  Sun,
  Shield,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";

export default function MpCarePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex h-14 items-center px-4">
        {/* Menu Bar */}
        <Menubar>
            <MenubarMenu>
              <MenubarTrigger>Care Guide</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Complete Care Manual
                  <MenubarShortcut>⌘M</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <FileText className="mr-2 h-4 w-4" />
                  Quick Start Guide
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Heart className="mr-2 h-4 w-4" />
                  Maintenance Schedule
                </MenubarItem>
                <MenubarItem>
                  <Clock className="mr-2 h-4 w-4" />
                  Care Reminders
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Cleaning</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <Droplets className="mr-2 h-4 w-4" />
                  Washing Instructions
                </MenubarItem>
                <MenubarItem>
                  <Shield className="mr-2 h-4 w-4" />
                  Stain Removal
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Sun className="mr-2 h-4 w-4" />
                  Drying Methods
                </MenubarItem>
                <MenubarItem>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Fabric Care Labels
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Maintenance</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Storage Tips</MenubarItem>
                <MenubarItem>Pillow Fluffing</MenubarItem>
                <MenubarItem>Shape Restoration</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Seasonal Care</MenubarItem>
                <MenubarItem>Long-term Preservation</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Troubleshooting</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Common Issues
                </MenubarItem>
                <MenubarItem>FAQ</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Contact Support</MenubarItem>
                <MenubarItem>Warranty Information</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </div>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl text-foreground mb-4">
              Mpillow Care
            </h1>
            <p className="text-lg text-muted-foreground">
              Learn how to properly care for and maintain your custom pillows to ensure they last for years.
            </p>
          </div>

          <div className="mb-10">
            <MpCareAftercareSection />
          </div>

          {/* Care Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-card border rounded-lg p-6 hover:shadow-md transition-shadow">
              <Droplets className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg mb-2">Washing & Cleaning</h3>
              <p className="text-sm text-muted-foreground">
                Proper washing techniques and stain removal methods for different fabric types.
              </p>
            </div>

            <div className="bg-card border rounded-lg p-6 hover:shadow-md transition-shadow">
              <Shield className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg mb-2">Protection & Storage</h3>
              <p className="text-sm text-muted-foreground">
                How to protect your pillows from dust, moisture, and wear over time.
              </p>
            </div>

            <div className="bg-card border rounded-lg p-6 hover:shadow-md transition-shadow">
              <Heart className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg mb-2">Maintenance Tips</h3>
              <p className="text-sm text-muted-foreground">
                Regular care routines to keep your pillows looking and feeling great.
              </p>
            </div>
          </div>

          {/* Quick Care Tips */}
          <div className="bg-card/50 border rounded-lg p-6">
            <h3 className="text-xl mb-4 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              Quick Care Tips
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Air out pillows regularly to prevent moisture buildup</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Fluff pillows daily to maintain shape and comfort</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Wash pillow covers according to fabric care labels</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Store in cool, dry place when not in use</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Rotate pillows regularly for even wear</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <p className="text-sm">Check for signs of wear and replace when needed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
