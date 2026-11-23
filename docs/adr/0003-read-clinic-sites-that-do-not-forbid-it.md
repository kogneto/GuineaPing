# Read some Clinics’ own sites, and never the ones that say no

ClinicalTrials.gov does not say what a study pays or how long the stay is. Clinics say it on their own recruitment sites. GuineaPing reads the study lists of the Clinics whose sites do not forbid it, once an hour, and shows each Opening in the Clinic’s own words with a link to its page. For every other Clinic it shows only a link, and the Member reads the page themselves.

The Clinics that are read have not been asked. Their sites say nothing about automated reading, and the owner decided on 2026-11-22 to assume permission, because GuineaPing is a private group, is not a paid app, and does not need the Openings to be built. The research behind the choice of Clinics is in `docs/research/paid-study-sources.md` (pull request #19).

## Rules the Clinic read keeps

- **Only listed sources.** A Clinic is read only if it has a reader in `src/worker/openings/sources.ts`. Clinics whose terms forbid bots or scraping (ICON, CenExel, Trialmed, Medpace, Parexel, Syneos, Dr. Vince) and Clinics that block scripts are link-only.
- **Once an hour.** Each source is read at most once an hour, one source per run, the runs six minutes apart. It was once a day until 2026-11-23. The owner changed it so that a Member can hear of a new Opening within the hour: paid tip channels pass studies on within minutes, and a day-old list is no use against them. One plain page request an hour is still far less than a person browsing the site.
- **A no is final.** If a site answers 401, 403 or 429, or shows a challenge page, reading that source stops until a person clears it.
- **No disguise.** Requests carry no browser identity. The owner chose not to send an identifying User-Agent either, so requests set no headers at all.
- **The Clinic’s words.** Text is stored and shown as plain text, unchanged. Dates and amounts are not interpreted. Links are kept only if they are https on the Clinic’s own host.
- **Inside the group.** Openings are shown only to Members.
- **Pfizer.** Its terms limit copying to personal reference, so only the title, pay, who it is for, and the link are kept.

## Considered Options

- **Ask each Clinic first**: the careful route. Set aside for now by the owner; still the way to add a Clinic whose terms forbid reading.
- **Screenshots of the pages**: still an automated tool visiting the site, so it changes nothing for Clinics that forbid that, and it is heavier and less reliable than text for the ones that do not.
- **A Clinic Watch on ClinicalTrials.gov**: alerts when a new Trial names a Clinic. Needs no permission. Not built yet; it would sit beside this, not replace it.

## Consequences

- robots.txt for each source was checked by hand on 2026-11-22 and allowed the list. The read does not fetch robots.txt, so it must be checked again by hand when a source is added or a Clinic changes its site.
- Each source has its own parser. A redesign makes the parser find nothing; the read then keeps the Openings it had, reports the problem once, and tries again the next hour.
- Reading every hour makes it more likely that a site answers 429 one day. That is still a no: the source goes quiet until a person clears it.
- To clear a refusal, a person checks the Clinic’s site and terms, then sets `refused_at` to NULL for that source in `clinic_sources`.
- If a Clinic asks GuineaPing to stop, remove its reader from `sources.ts`. Its Clinic entry stays, as a link.
- Openings have no Alerts. A Member sees them on the Clinics page, and can ask, Clinic by Clinic, for a Push when a read finds a new one there (since 2026-11-23). That Push names the Clinic and gives the entry’s title, pay, dates and stay, which a glance at the phone would show; the Member is told so where they choose.
