/**
 * How many Alerts and notes the Member has not opened yet, for the count on the Alerts tab.
 * The rule is the Alerts page's own: an Alert marked "Not for me" does not count.
 */
import { useEffect, useState } from "react";
import type { AlertListItem } from "../shared/api";
import { api } from "./api";

export const unreadCount = (items: AlertListItem[]): number => items.filter((i) => !i.read && (i.kind === "note" || i.mark !== "not_for_me")).length;

const listeners = new Set<() => void>();
/** Call after reading or marking an Alert or note, so the tab's count follows. */
export const alertsChanged = (): void => listeners.forEach((l) => l());

/** The count, fetched again whenever the page changes or an Alert is read or marked. */
export function useUnread(path: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let current = true;
    const load = () => api<AlertListItem[]>("/api/alerts").then((items) => current && setCount(unreadCount(items)), () => {});
    load();
    listeners.add(load);
    return () => {
      current = false;
      listeners.delete(load);
    };
  }, [path]);
  return count;
}
