'use client';

import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import { Home, Wrench, Heart, Settings } from "lucide-react";
import Link from "next/link";

const dockItems = [
  {
    title: "Home",
    icon: (
      <Home className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/",
  },
  {
    title: "Mpillow Maker",
    icon: (
      <Wrench className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/mp-maker",
  },
  {
    title: "Mpillow Care",
    icon: (
      <Heart className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/mp-care",
  },
  {
    title: "Settings",
    icon: (
      <Settings className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    href: "/settings",
  },
];

export function AppDock() {
  return (
    <div className="fixed bottom-2 left-1/2 max-w-full -translate-x-1/2 z-50">
      <Dock className="items-end pb-3">
        {dockItems.map((item, idx) => (
          <Link key={idx} href={item.href}>
            <DockItem className="aspect-square rounded-full bg-gray-200 dark:bg-neutral-800">
              <DockLabel>{item.title}</DockLabel>
              <DockIcon>{item.icon}</DockIcon>
            </DockItem>
          </Link>
        ))}
      </Dock>
    </div>
  );
}
