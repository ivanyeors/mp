'use client';

import * as React from "react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/shadcn-io/dock";
import { Home, Heart, Settings, Ruler } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const dockItems = [
  {
    title: "Home",
    icon: Home,
    href: "/",
  },
  {
    title: "Mpillow Config",
    icon: Ruler,
    href: "/mp-config",
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
  const [isHidden, setIsHidden] = React.useState(false);

  React.useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;

      // near top: always show
      if (y < 24) {
        setIsHidden(false);
        lastY = y;
        return;
      }

      // scroll down: hide; scroll up: show
      if (delta > 6) setIsHidden(true);
      if (delta < -6) setIsHidden(false);

      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed left-1/2 max-w-full -translate-x-1/2 z-50 transition-transform duration-200 ease-out ${
        isHidden ? "translate-y-24 opacity-0" : "translate-y-0 opacity-100"
      }`}
      style={{ bottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <Dock className="items-end pb-3">
        {dockItems.map((item, idx) => {
          const isActive = pathname === item.href;
          const IconComponent = item.icon;
          return (
            <Link key={idx} href={item.href}>
              <DockItem
                className="aspect-square rounded-full bg-gray-800/30 dark:bg-neutral-800/50 backdrop-blur-sm"
                isActive={isActive}
              >
                <DockLabel>{item.title}</DockLabel>
                <DockIcon>
                  <IconComponent className={`h-full w-full ${isActive ? 'text-white' : 'text-gray-200 dark:text-neutral-300'}`} />
                </DockIcon>
              </DockItem>
            </Link>
          );
        })}
      </Dock>
    </div>
  );
}
