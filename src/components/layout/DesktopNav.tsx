import React, { useRef, useState, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Priority+ navigation: renders as many nav items as fit in the available
 * width, collapsing the overflow into a "Plus ▾" dropdown. Widths are measured
 * with an offscreen mirror + ResizeObserver, so items never overlap regardless
 * of viewport width or how long the labels are (e.g. "Dashboard Créateur").
 */
export const DesktopNav: React.FC<{ items: NavItem[]; pathname: string }> = ({ items, pathname }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(path));

  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const mirror = measureRef.current;
      if (!container || !mirror) return;

      const widths = (Array.from(mirror.children) as HTMLElement[]).map(c => c.offsetWidth);
      const available = container.clientWidth;
      const GAP = 2;          // matches gap-0.5
      const MORE_W = 104;     // reserved width for the "Plus" button

      // First pass: do all items fit without a "Plus" button?
      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] + GAP;
        if (used + w <= available) { used += w; count++; } else break;
      }

      // If not, recompute reserving room for the "Plus" button.
      if (count < items.length) {
        used = 0; count = 0;
        for (let i = 0; i < widths.length; i++) {
          const w = widths[i] + GAP;
          if (used + w <= available - MORE_W) { used += w; count++; } else break;
        }
      }

      setVisibleCount(prev => (prev === count ? prev : count));
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [items]);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-ios-md text-sm font-medium whitespace-nowrap transition-all duration-200 ${
      active
        ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark font-semibold'
        : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5'
    }`;

  return (
    <div ref={containerRef} className="hidden lg:flex flex-1 min-w-0 items-center gap-0.5 overflow-hidden mx-2 relative">
      {/* Visible items */}
      {visible.map(item => {
        const Icon = item.icon;
        return (
          <Link key={item.path} to={item.path} title={item.label} className={linkClass(isActive(item.path))}>
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {/* Overflow "Plus" dropdown */}
      {overflow.length > 0 && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={linkClass(overflow.some(i => isActive(i.path)))}
            title="Plus de sections"
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" />
            <span>Plus</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div className="absolute left-0 mt-2 w-56 glass-panel border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 overflow-hidden animate-fade-in p-1.5">
                {overflow.map(item => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark'
                          : 'text-ios-label-primaryLight dark:text-white hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Offscreen mirror used purely for width measurement */}
      <div
        ref={measureRef}
        aria-hidden
        className="absolute top-0 left-0 flex items-center gap-0.5 pointer-events-none opacity-0 -z-10"
        style={{ visibility: 'hidden' }}
      >
        {items.map(item => {
          const Icon = item.icon;
          return (
            <span key={item.path} className={linkClass(false)}>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};
