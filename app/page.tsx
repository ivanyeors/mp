import { ModeToggle } from "@/components/mode-toggle";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import { Home as HomeIcon, Wrench, Heart, Settings } from "lucide-react";

const dockItems = [
  {
    title: "Home",
    icon: (
      <HomeIcon className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/",
  },
  {
    title: "Mpillow Maker",
    icon: (
      <Wrench className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/mpillow-maker",
  },
  {
    title: "Mpillow Care",
    icon: (
      <Heart className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/mpillow-care",
  },
  {
    title: "Settings",
    icon: (
      <Settings className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/settings",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Header with theme toggle */}
      <div className="absolute top-4 right-4 z-10">
        <ModeToggle />
      </div>

      {/* Main content area */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-foreground">
            Welcome to Mpillow
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Navigate using the dock below to explore Mpillow maker, care instructions, and settings.
          </p>
        </div>
      </main>

      {/* Dock positioned at bottom */}
      <div className="absolute bottom-2 left-1/2 max-w-full -translate-x-1/2">
        <Dock className="items-end pb-3">
          {dockItems.map((item, idx) => (
            <DockItem
              key={idx}
              className="aspect-square rounded-full bg-gray-200 dark:bg-neutral-800"
            >
              <DockLabel>{item.title}</DockLabel>
              <DockIcon>{item.icon}</DockIcon>
            </DockItem>
          ))}
        </Dock>
      </div>
    </div>
  );
}
