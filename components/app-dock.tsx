'use client';

import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import { Home, Wrench, Heart, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const dockItems = [
  {
    title: "Home",
    icon: Home,
    href: "/",
  },
  {
    title: "Mpillow Maker",
    icon: Wrench,
    href: "/mp-maker",
  },
  {
    title: "Mpillow Care",
    icon: Heart,
    href: "/mp-care",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/settings",
  },
];

export function AppDock() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-2 left-1/2 max-w-full -translate-x-1/2 z-50">
      <Dock className="items-end pb-3">
        {dockItems.map((item, idx) => {
          const isActive = pathname === item.href;
          const IconComponent = item.icon;
          return (
            <Link key={idx} href={item.href}>
              <DockItem
                className="aspect-square rounded-full bg-gray-200 dark:bg-neutral-800"
                isActive={isActive}
              >
                <DockLabel>{item.title}</DockLabel>
                <DockIcon>
                  <IconComponent className={`h-full w-full ${isActive ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}`} />
                </DockIcon>
              </DockItem>
            </Link>
          );
        })}
      </Dock>
    </div>
  );
}
