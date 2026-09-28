"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookmarkIcon, CompassIcon, LogInIcon, MenuIcon, UserRoundIcon } from "lucide-react";
import type { DataMode } from "@/lib/db/mode";
import { RadarMark } from "@/components/radar-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavLinks({
  mode,
  onNavigate,
}: {
  mode: DataMode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Discover Events", icon: CompassIcon },
    { href: "/profile", label: "My Profile", icon: UserRoundIcon },
    { href: "/saved", label: "Saved Events", icon: BookmarkIcon },
    ...(mode === "supabase" ? [{ href: "/sign-in", label: "Sign in", icon: LogInIcon }] : []),
  ];

  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <RadarMark className="size-9 text-primary" />
      <span className="text-sm font-medium">Startup Radar</span>
    </Link>
  );
}

export function AppShell({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: DataMode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col gap-8 border-r bg-sidebar px-4 py-6 md:flex">
        <Brand />
        <NavLinks mode={mode} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Brand />
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger render={<Button variant="outline" size="icon" />}>
              <MenuIcon />
              <span className="sr-only">Open navigation</span>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Startup Radar</SheetTitle>
              </SheetHeader>
              <div className="px-4">
                <NavLinks mode={mode} onNavigate={() => setNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 md:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
