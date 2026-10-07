"use client";

import { useState, useEffect } from "react";
import { AccountPanel } from "./AccountPanel";
import { FileDisputeModal } from "./FileDisputeModal";
import { FaucetButton } from "./FaucetButton";
import { useSnapshot } from "@/lib/hooks/useVerdict";
import { formatGen, wei } from "@/lib/contracts/types";
import { BrandMark } from "./BrandMark";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { agents, disputes } = useSnapshot();

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const threshold = 80;

      setIsScrolled(scrollY > 20);

      // Calculate progress from 0 to 1 for smoother animations
      const progress = Math.min(Math.max((scrollY - 10) / threshold, 0), 1);
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Minimal variant with scroll animations
  const paddingTop = Math.round(scrollProgress * 16); // 0-16px padding
  const headerHeight = 64 - Math.round(scrollProgress * 8); // 64px to 56px

  // Only apply border radius on desktop (md breakpoint and up)
  const getBorderRadius = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      return Math.round(scrollProgress * 9999); // Fully rounded when scrolled on desktop
    }
    return 0; // No rounding on mobile
  };
  const borderRadius = getBorderRadius();

  const bondedGen = formatGen(agents.reduce((t, a) => t + wei(a.bond), 0n), 1);
  const openCount = disputes.filter((d) => d.state !== "settled").length;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out"
      style={{ paddingTop: `${paddingTop}px` }}
    >
      <div
        className="transition-all duration-500 ease-out"
        style={{
          width: '100%',
          maxWidth: isScrolled ? '80rem' : '100%',
          margin: '0 auto',
          borderRadius: `${borderRadius}px`,
        }}
      >
        <div
          className="backdrop-blur-xl border transition-all duration-500 ease-out md:rounded-none"
          style={{
            borderColor: `rgb(48 54 61 / ${0.5 + scrollProgress * 0.5})`,
            background: `rgb(13 17 23 / ${0.55 + scrollProgress * 0.35})`,
            borderRadius: `${borderRadius}px`,
            borderWidth: '1px',
            borderLeftWidth: isScrolled ? '1px' : '0px',
            borderRightWidth: isScrolled ? '1px' : '0px',
            borderTopWidth: isScrolled ? '1px' : '0px',
            boxShadow: isScrolled
              ? '0 24px 48px 0 rgba(0, 0, 0, 0.35)'
              : 'none',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          }}
        >
          <div
            className="px-4 sm:px-6 transition-all duration-500 mx-auto"
            style={{
              maxWidth: isScrolled ? '80rem' : '112rem',
            }}
          >
            <div
              className="flex items-center justify-between transition-all duration-500"
              style={{ height: `${headerHeight}px` }}
            >
              {/* Left: Logo */}
              <div className="flex items-center gap-3">
                <BrandMark size={30} />
                <span className="hidden sm:inline text-lg md:text-xl font-bold">Verdict</span>
              </div>

              {/* Center: Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Bonded:</span>
                  <span className="text-foreground font-bold text-accent">{bondedGen} GEN</span>
                </div>
                {openCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Open disputes:</span>
                    <span className="text-sky-300 font-bold">{openCount}</span>
                  </div>
                )}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2 sm:gap-3">
                <FaucetButton />
                <FileDisputeModal />
                <AccountPanel />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
