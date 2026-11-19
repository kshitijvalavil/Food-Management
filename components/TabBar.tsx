"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { useAddSheet } from "./AddSheet";

const TABS: Array<{ href: string; label: string; icon: IconName; match: (p: string) => boolean }> = [
  { href: "/", label: "Today", icon: "i-home", match: (p) => p === "/" || p.startsWith("/alerts") },
  { href: "/kitchen", label: "Kitchen", icon: "i-fridge", match: (p) => p.startsWith("/kitchen") || p.startsWith("/item") || p.startsWith("/shopping") },
  { href: "/cook", label: "Cook", icon: "i-pan", match: (p) => p.startsWith("/cook") },
  { href: "/me", label: "Me", icon: "i-user", match: (p) => p.startsWith("/me") },
];

function Tab({ t, pathname }: { t: (typeof TABS)[number]; pathname: string }) {
  const active = t.match(pathname);
  return (
    <Link href={t.href} aria-current={active ? "page" : undefined} data-testid={`tab-${t.label.toLowerCase()}`}>
      <Icon name={t.icon} />
      {t.label}
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const { open, setOpen } = useAddSheet();
  const [today, kitchen, cook, me] = TABS as [typeof TABS[0], typeof TABS[0], typeof TABS[0], typeof TABS[0]];
  return (
    <nav className="tabbar" aria-label="Main" style={{ zIndex: open ? 42 : 30 }}>
      <Tab t={today} pathname={pathname} />
      <Tab t={kitchen} pathname={pathname} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Close add food" : "Add food"}
        data-testid="tab-add"
      >
        <span className="add-pill">
          <Icon name={open ? "i-x" : "i-plus"} />
        </span>
      </button>
      <Tab t={cook} pathname={pathname} />
      <Tab t={me} pathname={pathname} />
    </nav>
  );
}
