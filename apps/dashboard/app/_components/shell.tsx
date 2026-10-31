"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { activeTier, tierPath } from "../../lib/query";
import { TIERS } from "../../lib/types";

/** App shell: top bar, sidebar, main. Below 1024px the sidebar is a drawer behind the Menu button. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = activeTier(pathname);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="app" data-nav-open={open}>
      <header className="topbar">
        <button
          type="button"
          className="menu-btn gm-btn gm-btn--secondary gm-btn--sm"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
        <Link className="brand" href="/">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="10" cy="10" r="8" />
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 10 16 5" strokeLinecap="round" />
          </svg>
          Idea Radar
        </Link>
        <span className="gm-tag">v1</span>
      </header>
      <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="sidebar" className="sidebar" aria-label="Main navigation">
        <nav className="gm-sidenav">
          <div className="gm-sidenav__group">
            <div className="gm-sidenav__label">// tiers</div>
            {TIERS.map((t) => (
              <Link key={t.id} className="gm-sidenav__item" href={tierPath(t.id)} aria-current={t.id === current ? "page" : undefined}>
                <span className="gm-dot" aria-hidden="true" />
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      </aside>
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
