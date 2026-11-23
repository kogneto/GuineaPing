/** The small drawings on the section tabs. Decoration only: each tab also says its name. */
const PATHS = {
  alerts: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4.5a2 2 0 0 0 4 0",
  watches: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clinics: "M4 20.5V8l8-4.5L20 8v12.5H4Zm8-10.5v6m-3-3h6",
  devices: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5Zm3 16h2",
  members: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 9a6.5 6.5 0 0 1 13 0m1-9.5a3 3 0 1 0-1.2-5.7M18 14.2a5.5 5.5 0 0 1 3.5 5.3",
} as const;

export type TabName = keyof typeof PATHS;

export function TabIcon({ name }: { name: TabName }) {
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
