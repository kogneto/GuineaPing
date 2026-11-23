/** The small drawings on the section tabs. Decoration only: each tab also says its name. */
const PATHS = {
  alerts: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4.5a2 2 0 0 0 4 0",
  watches: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clinics: "M4 20.5V8l8-4.5L20 8v12.5H4Zm8-10.5v6m-3-3h6",
  settings: "M4 7h9m4 0h3M4 17h3m4 0h9M15 4.5v5M9 14.5v5",
} as const;

export type TabName = keyof typeof PATHS;

export function TabIcon({ name }: { name: TabName }) {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
