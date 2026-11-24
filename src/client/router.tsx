import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

const listeners = new Set<() => void>();

export function navigate(to: string) {
  history.pushState(null, "", to);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function Link({ to, className, children, "aria-label": label }: { to: string; className?: string; children: ReactNode; "aria-label"?: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} aria-label={label} onClick={onClick}>
      {children}
    </a>
  );
}
