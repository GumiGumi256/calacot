"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Toggle theme"
          className="group relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2 bg-brand-black border border-brand-white/20 dark:bg-brand-white"
        
        >
          {/* Desktop Label */}
          <span className="hidden text-sm font-semibold tracking-wide sm:block dark:text-brand-black text-brand-white">
            Theme
          </span>

          {/* Icon Circle */}
          <div
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-brand-white dark:text-brand-black"
            // style={{
            //   backgroundColor: "var(--primary)",
            //   color: "var(--primary-foreground)",
            // }}
          >
            <Sun className="absolute h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />

            <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="rounded-2xl border-border/50 bg-background/95 backdrop-blur-xl"
      >
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}