/** The guinea pig scenes in public/art/scenes. All are 480×480 WebP squares (full-size originals are in art/source). */
const ART = {
  alertBell: "/art/scenes/alert-bell.webp",
  alertExclaim: "/art/scenes/alert-exclaim.webp",
  clinician: "/art/scenes/clinician.webp",
  bloodDraw: "/art/scenes/blood-draw.webp",
  breakRoom: "/art/scenes/break-room.webp",
  lookout: "/art/scenes/lookout.webp",
  makingWatch: "/art/scenes/making-watch.webp",
  reading: "/art/scenes/reading.webp",
  goodbye: "/art/scenes/goodbye.webp",
  match: "/art/scenes/match.webp",
  private: "/art/scenes/private.webp",
  errorPhone: "/art/scenes/error-phone.webp",
  welcome: "/art/scenes/welcome.webp",
  lost: "/art/scenes/lost.webp",
  notifications: "/art/scenes/notifications.webp",
} as const;

export type ArtName = keyof typeof ART;

/**
 * A decorative illustration on a cream plate, so the charcoal outlines read
 * in dark mode too. It carries no meaning of its own: the text beside it does.
 */
export function Illustration({ name, size = "md" }: { name: ArtName; size?: "xs" | "sm" | "md" | "hero" }) {
  // The scenes are mostly canvas, so the small "xs" frame crops in on the character.
  return (
    <span className={`art art-${size}`} aria-hidden="true">
      <img src={ART[name]} alt="" width={480} height={480} loading="lazy" decoding="async" />
    </span>
  );
}
