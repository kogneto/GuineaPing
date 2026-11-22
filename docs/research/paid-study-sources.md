# Where paid healthy-volunteer studies are listed

Research for a possible clinic feature. Checked on 2026-11-22. Nothing has been built.

Terms follow `CONTEXT.md`: a **Trial** is a study registered on ClinicalTrials.gov. A **clinic listing** is an entry on a clinic's own recruitment site. A clinic listing is not a Trial, and none of them can yet be tied to one.

Every claim is marked **[V]** (verified: the page was fetched on 2026-11-22 and the URL is given) or **[U]** (unverified: from a search-result snippet, a third party, or general knowledge). "Blocked" means the site refused a plain scripted request (HTTP 403, usually a Cloudflare challenge). We did not try to get around any block, did not log in, did not submit forms, and did not accept any cookie or terms banner. Each site got a handful of page requests, not a crawl.

## Conclusion

1. **The claim holds for clinic sites, not for volunteer-run sites.** Paid Phase 1 studies are advertised on the clinics' own recruitment sites, and these show what ClinicalTrials.gov does not: pay, nights in clinic, visits, and often dates. The volunteer-run listing sites we expected turned out to list clinics, not studies (point 5). Of 18 clinic operators checked, 8 publish a public study list we could read as plain HTML. 8 blocked scripted requests, one needs JavaScript, and one had an empty list that day.
2. **No clinic listing we read carries an NCT ID** (none appears in any page we saved). Clinics use their own study codes. So a clinic listing cannot be reliably joined to a Trial.
3. **Reading clinic lists automatically (step 3) is feasible for a few sources only.** Altasciences (Kansas City and Los Angeles), Celerion, Fortrea, Orlando Clinical Research Center and Pharmaron have plain pages, robots.txt allows them, and we found no terms that forbid it. ICON and CenExel publish good lists but their terms forbid bots and scraping. Upkeep: each site needs its own reader, and any redesign breaks it.
4. **The clinic directory (step 1) can be built from ClinicalTrials.gov data**, but not from that data alone. The data gives the facility name, city and a map point for almost every site. It does not give the recruitment website, and facility names are messy. The links to sign-up pages must be added and checked by hand, about 20 to 30 of them.
5. **No free, volunteer-run site lists individual paid studies.** JustAnotherLabRat is a directory of clinics, not of studies. The others are commercial.
6. **The usual waiting period between studies is 30 days**, sometimes longer. Two clinics state it, and most ClinicalTrials.gov eligibility texts that give a window say 30 days or "5 half-lives". Commercial registries (Verified Clinical Trials, clinicalRSVP) let clinics detect overlapping enrolment. Volunteers cannot see their own record there, as far as we found.

## 1. Which clinics run the most Trials now (ClinicalTrials.gov)

**Query [V].** `https://clinicaltrials.gov/api/v2/studies` with
`filter.advanced=AREA[HealthyVolunteers]true AND AREA[Phase](PHASE1 OR EARLY_PHASE1) AND AREA[LocationCountry]"United States"`,
`filter.overallStatus=RECRUITING,NOT_YET_RECRUITING`, and the fields `NCTId, LocationFacility, LocationCity, LocationState, LocationCountry, LocationGeoPoint, LeadSponsorName, LeadSponsorClass`. Run on 2026-11-22; it returned **715 Trials**.

**Who runs them [V].**
- 256 Trials (36%) have a company as lead sponsor. These are the ones most likely to be paid Phase 1 work.
- 399 (56%) are led by universities and hospitals, 52 by NIH.
- 539 of the 715 (75%) have a single US site.

**How usable the facility names are [V].**
- The 715 Trials list 1,370 US sites. 1,368 of them have a map point.
- 147 of those sites (11%) have no real name: "Research Site", "GSK Investigational Site", "Local Institution - 0002" and similar. These are mostly multi-site company Trials (AstraZeneca, Merck, ViiV). They cannot be tied to a clinic without guessing.
- The rest are named, but one clinic is often spelled several ways. Examples: "CenExel ACT", "CenExel ACT (Formerly Anaheim Clinical Trials; LLC)" and "Anaheim Clinical Trials, LLC" are the same Anaheim unit. "Celerion" and "Celerion, Lincoln" are the same. We grouped these by normalising names (lower case, dropping "LLC", site codes and bracketed text) and by matching operator names. That grouping is a judgement, not a fact in the data.

**Two rankings.** The raw count by facility is led by research hospitals. Grouping by commercial operator shows the dedicated Phase 1 units.

| Raw top facilities (Trials) | Commercial operators, grouped (Trials, US sites) |
|---|---|
| NIH Clinical Center, Bethesda MD (33) | CenExel (29: Anaheim CA, Los Alamitos CA, Decatur GA, Marlton NJ, Salt Lake City UT, Englewood CO) |
| Orlando Clinical Research Center, FL (14) | ICON (21: Salt Lake City UT, Lenexa KS, San Antonio TX) |
| Massachusetts General Hospital, Boston (11) | Fortrea (17: Daytona Beach FL, Dallas TX, Madison WI) |
| Brigham and Women's Hospital, Boston (10) | Orlando Clinical Research Center (15) |
| CNS (CenExel), Los Alamitos CA (9) | Celerion (12: Lincoln NE, Tempe AZ) |
| University of Iowa (9) | PPD / Thermo Fisher (9: Austin TX, Las Vegas NV) |
| Fortrea, Daytona Beach FL (8) | Floridian Clinical Research, Miami Lakes FL (9) |
| Fortrea, Dallas TX (8) | Altasciences (9: Overland Park KS, Cypress CA) |
| Floridian Clinical Research, Miami Lakes FL (8) | QUEST Research Institute, Farmington Hills MI (8) |
| Genesis Clinical Research, Tampa FL (8) | Clinical Pharmacology of Miami (8) |

The query above can be re-run to reproduce both lists.

**Rule used to pick the clinics below.** We checked the commercial operators with the most company-sponsored Trials that are known as dedicated Phase 1 units [U, general knowledge]: CenExel, ICON, Fortrea, Orlando Clinical Research Center, Celerion, PPD, Altasciences, QUEST, Clinical Pharmacology of Miami, Quotient Sciences, Parexel, QPS, Medpace, Pharmaron, Nucleus Network and ProSciento. We also checked the NIH Clinical Center and the Johns Hopkins Behavioral Pharmacology Research Unit, because they run many healthy-volunteer Trials.

Not checked, though they rank high: Floridian Clinical Research, Genesis Clinical Research, K2 Medical Research and Charter Research. Their Trials here are mostly kidney or liver impairment studies with matched healthy people, or Alzheimer's and Parkinson's studies with a healthy arm [V, Trial titles and conditions]. They are worth a follow-up, since the healthy arm may be paid. The university hospitals were not checked either; their healthy-volunteer Trials are mostly unpaid or lightly paid research [U].

## 2. Clinic recruitment sites

"Form" means how the list is delivered. Plain HTML can be read with a simple request. "Needs JavaScript" means the studies only appear after scripts run in a browser.

| Clinic (cities) | Study list | Pay | Dates | Nights / visits | Age / sex / BMI | Own code; NCT ID | Form | robots.txt | Terms on automated reading |
|---|---|---|---|---|---|---|---|---|---|
| **Altasciences** (Overland Park KS) | [participantskc.altasciences.com/available-studies](https://participantskc.altasciences.com/available-studies) [V] | Yes, e.g. "$ 5 550" | Yes, e.g. "1 to 5 Dec" | Visits on list; stay on detail page ("5 days/4 nights") | Age and sex on list; BMI on detail ("18.00 - 30.00") | Yes (e.g. N49); no NCT | Plain HTML | Allows list and detail pages; Crawl-delay 10 | Not addressed (only privacy and cookie pages) [V] |
| **Altasciences** (Cypress CA) | [participantsla.altasciences.com/current-studies](https://participantsla.altasciences.com/current-studies) [V] | Yes, "up to $8,950" | Not seen | Yes, "three 4-night stays" | Age, sex; BMI on detail | Yes (e.g. N-40700); no NCT | Plain HTML | Allows list | Not addressed [V] |
| **Celerion** (Lincoln NE, Tempe AZ) | [helpresearch.com/studies](https://helpresearch.com/studies) [V] | Yes, "$3,750*" | Yes, start and end | On detail page ("4 Night Stay & 1 Return") | Age, sex on list; BMI on detail ("19 - 32") | Yes (e.g. CA52371-3); no NCT | Plain HTML | Allows /studies and /medical-study/; Crawl-delay 10 | Not addressed (no terms page found) [V] |
| **Fortrea** (Daytona Beach FL, Dallas TX, Madison WI) | [fortreaclinicaltrials.com/en-us/clinical-research/browse-studies](https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies) [V] | Yes, "$3,552" | Yes, "Dec 07 2026 - Dec 16 2026" | Yes, "1 stay of 5 nights & 1 follow-up visit" | Age, smokers; sex as filter only; no BMI | Yes (e.g. "778951 9b"); no NCT | Plain HTML | Allows list | Not addressed (the only terms are a supplier contract) [V] |
| **Orlando Clinical Research Center** (Orlando FL) | [ocrc.net/current-studies](https://ocrc.net/current-studies/) [V] | On detail page, "up to $4,025 for time and travel" | No | Detail: "6 days and 5 nights", "5 follow-up visits" | Age; no BMI | Letter code only (e.g. V4); no NCT | Plain HTML | Allows all | Not addressed (no terms page) [V]. Most of its current studies are kidney or liver impairment studies, not healthy-only |
| **Pharmaron** (Baltimore MD) | [pharmaron.com/…/clinical-trial-recruitment-us](https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/) [V] | Yes, "compensated up to $8,100" | No | Yes, "18 days/17 nights" | Age, sex; BMI only where it is a criterion | Name only (e.g. CHESAPEAKE); no NCT | Plain HTML, one page | Allows all | Not addressed (no terms page; privacy notice only) [V] |
| **ICON** (Lenexa KS, Salt Lake City UT, San Antonio TX) | [iconstudies.com/All-Clinical-Research-Studies](https://iconstudies.com/All-Clinical-Research-Studies/) [V] | Yes, "Up to $10500" | No | Yes, "1 stay of 6 nights and 6 outpatient visits" | Age, sex; BMI on detail | Yes (e.g. 0078-2765); no NCT | Plain HTML | Allows (only /wp-admin/ disallowed) | **Forbidden**: "Use any bots, spiders, trojans, worms, spyware" ([Terms](https://iconstudies.com/Terms-of-Use/)) [V] |
| **CenExel** (Anaheim CA, Los Alamitos CA, Decatur GA, Marlton NJ, Englewood CO) | Per unit, e.g. [cenexelresearch.com/act/all-studies](https://cenexelresearch.com/act/all-studies/) [V] | Yes, "up to $9,500" or "TBD" | No | No | Age, sex; no BMI | No | Plain HTML | Allows all | **Forbidden** on the central site: "engage in or use any data mining, robots, scraping" ([Terms](https://cenexelclinicaltrials.com/privacy-policy-and-terms/)) [V]. Unclear whether these terms cover the per-unit pages |
| **Nucleus Network** (Saint Paul MN) | [nucleusnetwork.com/participants/find-a-trial](https://www.nucleusnetwork.com/participants/find-a-trial/) [V] | Detail pages show pay, e.g. "up to $3,686" [U] | Unclear | "4-night inpatient stay and three outpatient visits" [U] | Age, BMI filters on page [V] | No NCT [U] | **Needs JavaScript**; the data call needs a signed token | Allows | Not addressed ([Terms](https://www.nucleusnetwork.com/terms-and-conditions/)) [V] |
| **Quotient Sciences** (Miami FL) | [weneedyoutrials.com/us/current-trials](https://www.weneedyoutrials.com/us/current-trials) [V] | Unknown: the list said "No trials found" on 2026-11-22 | – | – | Filters for sex, age, smoking | – | Unclear | Allows | Not addressed (privacy policy PDF only) [V] |
| **NIH Clinical Center** (Bethesda MD) | [os1.cc.nih.gov/recruit/protocols](https://os1.cc.nih.gov/recruit/protocols?f%5B0%5D=healthy_volunteer%3A1) (healthy-volunteer filter, 84 studies) [V] | Not on the list | No | No | Age group filter only | NIH study number (e.g. 002141-CH); NCT not on list | Plain HTML | Allows (on the os1 host; the main www.cc.nih.gov host was blocked) | Not addressed ([Disclaimers](https://os1.cc.nih.gov/disclaimers)) [V] |
| **Medpace** (Cincinnati OH) | [medpace.com/study-participants/browse-studies](https://www.medpace.com/study-participants/browse-studies/) | Snippets show pay in the title, "Healthy Adults, Ages 18-65, $5,550" [U] | Unclear | "two separate 2-night stays" [U] | Age [U] | Not seen | **Blocked** (403) | Allows the path | Unclear (blocked) |
| **PPD / Thermo Fisher** (Austin TX, Las Vegas NV) | [ppd.com/participate-in-clinical-trial](https://www.ppd.com/participate-in-clinical-trial/) | Snippet: "11 facility nights, up to $8,400" [U] | Unclear | [U] | Unclear | Unclear | **Blocked** (403) | Allows the path | Unclear (blocked) |
| **Parexel** (Glendale CA, Baltimore MD) | parexel.com/trials/locations/… | Unclear | Unclear | Unclear | Unclear | Unclear | **Blocked** (403) | Allows /trials | Unclear (blocked) |
| **QUEST Research Institute** (Farmington Hills MI) | No public list found | – | – | – | – | – | **Blocked** (403) | Allows; Crawl-delay 10 | Unclear (blocked) |
| **Clinical Pharmacology of Miami** | No list found | – | – | – | – | – | **Blocked** (403) | Allows; Crawl-delay 10 | Unclear (blocked) |
| **QPS** (South Miami FL, Springfield MO) | No public list found | – | – | – | – | – | **Blocked** (403) | Allows all | Unclear (blocked) |
| **ProSciento** (Chula Vista CA) | No list found | Snippet: "stipend of up to $4,150" [U] | – | – | – | – | **Blocked** (403) | Allows; Crawl-delay 10 | Unclear (blocked) |
| **Johns Hopkins BPRU** (Baltimore MD) | hopkinsmedicine.org/psychiatry/research/bpru/research-volunteers | Snippet: "up to $300 plus travel expenses" [U] | – | "6 outpatient visits" [U] | Ages 21-55 [U] | – | **Blocked** (403) | Allows | Unclear (blocked) |

Notes on the table:
- **robots.txt.** No clinic's robots.txt disallows its study list. robots.txt says what crawlers may fetch; it does not grant permission where the terms of use forbid it. Celerion's corporate site (celerion.com) names AI crawlers in its robots.txt, but blocks them only from /wp-admin/ [V]. That file is not the volunteer site.
- **Study codes are not NCT IDs.** Codes such as Celerion's "CA52371-3" appear to be internal. A search for "CA52371" and "CA052-371" on ClinicalTrials.gov found nothing [V]. We tested only this one code.
- **Closed studies stay listed** on some sites: Altasciences marks them "Recruitment Complete" [V]. A reader would need to filter them out.
- **Pay is shown as "up to"** almost everywhere [V]. It is probably the amount for finishing the whole study [U].
- **Terms "not addressed"** means: we found no terms-of-use page linked from the study list, and the parent company's home page links only to privacy and cookie pages (checked for Altasciences, Celerion and Pharmaron) [V]. Fortrea's only "terms" page is a supplier contract [V].

## 3. Sites that gather listings across clinics

| Site | What it is | Listing contents | Form | robots.txt | Terms on automated reading |
|---|---|---|---|---|---|
| **JustAnotherLabRat** ([jalr.org](https://jalr.org/)) | Long-running site by an individual operator, with ads. A directory of about 60 US Phase 1 clinics by state, with bed count, amenities, pay method and recruiting phone [V] | No per-study pay, dates or nights. Its "studies" link goes to Study Scavenger [V]. Its RSS feed's newest item is from 2019 [V] | Plain HTML | Allows all | Not addressed ([Disclaimer](https://jalr.org/disclaimer.html)) [V] |
| **Study Scavenger** ([studyscavenger.com](https://studyscavenger.com/)) | Commercial. Sells recruitment to clinics; free volunteer search and app [V] | Unclear: results need a search form to be submitted, which we did not do. The form offers a minimum-stipend filter [V] | Form (ASP.NET) | Main site disallows only /forum; the search host has no robots.txt [V] | Unclear: the EULA was not read |
| **CenterWatch** ([centerwatch.com/clinical-trials/listings](https://www.centerwatch.com/clinical-trials/listings)) | Commercial; about 40,000 trials by condition [V] | Unclear whether pay or nights are shown [U] | Plain HTML | Crawl-delay 10; disallows search and user paths [V] | Unclear (terms page blocked) |
| **ClinicalConnection** | Commercial lead generation | Unclear (blocked) | Blocked | Blocks named AI crawlers, including ClaudeBot and GPTBot [V] | Unclear (blocked) |
| **Antidote** ([antidote.me](https://www.antidote.me/)) | Commercial patient-matching | Not reviewed | – | Allows all but /search [V] | **Forbidden**: "systematic or automated data collection activities" ([Terms](https://www.antidote.me/terms-of-use)) [V] |
| **Reddit r/clinicaltrials** | Volunteer forum | Unclear (blocked) | Blocked | Blocked | Unclear |

No site gathers per-study pay, dates and nights across clinics for free. JustAnotherLabRat is useful as a hand-checked starting list of clinic names for the directory.

## 4. Waiting periods ("washout") between studies

**What clinics say.**
- Celerion: "we require at least a 30-day washout period" between studies ([page](https://helpresearch.com/learn/what-is-a-washout-period)) [V]. Its FAQ says this is typically 30 days but can be 90 ([FAQ](https://helpresearch.com/faq)) [V].
- Fortrea: volunteers take part in "one study at a time, usually with one month in between" ([FAQ](https://www.fortreaclinicaltrials.com/en-us/clinical-research/frequently-asked-questions-about-clinical-trials)) [V].
- Parexel Baltimore: only one study screening at a time [U, snippet only].
- ICON, CenExel and Altasciences: their FAQs say nothing about a waiting period [V]. Nucleus Network's FAQ: unclear, not fully read.

**What Trial rules say [V].** We searched the eligibility text of the same 715 Trials for a window after "another investigational drug / clinical study".
- 182 Trials state such a window. Of those, 132 say 30 days or less, 10 up to 60 days, 19 up to 90 days, and 21 longer.
- Of all 715, 125 mention "5 half-lives", meaning the window is longer for slow-clearing drugs. A typical wording: "within 30 days of Screening or 5 drug half-lives, whichever is longer" (NCT07882472).
- Of all 715, 97 limit recent blood or plasma donation.
- The counts come from a simple text search, so treat them as approximate.

So the real waiting time depends on each Trial's own rules, not on a single number. 30 days is the common minimum.

**Registries that detect overlapping enrolment.**
- **Verified Clinical Trials** ([verifiedclinicaltrials.com](https://verifiedclinicaltrials.com/)) [V]. A commercial database clinics check at screening. It says it detects people who are in another study or inside a washout. It stores initials, date of birth and a few identifiers as an encrypted code, with optional fingerprint or face checks. It claims "thousands" of sites in 34 or "over 50" countries; the two FAQ pages disagree. We found no way for a volunteer to see their own status online; the FAQ says to contact VCT or the clinic.
- **clinicalRSVP** ([clinicalrsvp.com](https://www.clinicalrsvp.com/)) [V]. Commercial. Tracks enrolment dates and washouts with fingerprint ID. No site count given; no volunteer view found.
- **DupCheck**: the site redirects to a blocked page; we could not confirm it is active.
- No eligibility text among the 715 Trials names any of these registries [V]. Clinics may still use them; protocols just don't say so.
- A 2012 review lists these registries as voluntary in the US, unlike the mandatory Swiss register and the UK TOPS register ([PMC5164923](https://pmc.ncbi.nlm.nih.gov/articles/PMC5164923/)) [V]. We found no FDA rule that requires a registry or a fixed waiting period [U].

For GuineaPing, a washout tracker (step 2) would be a reminder a Member keeps for themselves. It could count 30 days from their last dose by default and let them change it to match the study's rules. It cannot check any registry: none offers a volunteer-facing lookup that we found.

## 5. Recommendation

**Step 1, clinic directory: do it, with hand-kept links.**
- ClinicalTrials.gov gives each named site's city, state and map point. That is enough to sort clinics by distance from a Member's ZIP code.
- It does not give the recruitment website, and 11% of site rows have no usable name. So keep a small hand-made list: one row per clinic unit, with name, city, map point and the URL of its study list.
- The table above already gives about a dozen working study-list URLs; the blocked sites still have pages a person can open in a browser. JustAnotherLabRat's clinic list is a good cross-check.
- Optionally show how many open Phase 1 healthy-volunteer Trials each clinic has. This count comes from the facility name, so it needs the name grouping described in section 1.
- Upkeep: check the links a few times a year. Clinics rename themselves (Covance → Labcorp → Fortrea; Anaheim Clinical Trials → CenExel ACT).

**Step 3, reading clinic study lists: feasible only for a few sources, at a real upkeep cost.**
- Candidates where nothing we found forbids it: Altasciences (both sites), Celerion, Fortrea, Pharmaron and Orlando Clinical Research Center. Each publishes somewhere between 5 and about 15 listings (for example 6 at Orlando Clinical Research Center and 5 at Pharmaron on 2026-11-22 [V]); some of these are closed or are patient studies. Before building, ask each clinic for written permission. Their silence is not consent, and their terms could change.
- Not candidates without written permission: ICON and CenExel (terms forbid bots), Antidote (terms forbid it).
- Not reachable by simple requests: PPD, Medpace, Parexel, QUEST, QPS, Clinical Pharmacology of Miami, ProSciento (blocked), and Nucleus Network (needs JavaScript and a signed token).
- Honour the 10-second crawl delay where set, and read each list at most once a day.
- Upkeep: one reader per site, because every site lays out its pages differently. A redesign silently breaks a reader, so each one needs a check that it still finds listings. Expect to fix one or two a year at least [U, estimate].
- Showing the clinic's own words for pay, dates and nights fits the "source's own words" rule. Because there is no NCT ID, clinic listings would be a separate thing from Trials, not extra facts on an existing Trial. The glossary would need a new term for them.

**Cheaper middle option.** Link each directory entry straight to the clinic's study list and let Members read it there. This needs no permission and no upkeep beyond the link check.

## Method and limits

- The ClinicalTrials.gov query and counts were run by script on 2026-11-22. The grouping of facility names is our judgement.
- Clinic pages were fetched with plain HTTP requests (curl) on 2026-11-22, saved, and searched for the fields above. Parts of this were done by research helpers; the key quotes and values were checked again against the saved pages (Altasciences, Orlando Clinical Research Center, Pharmaron, ICON, CenExel, Fortrea, Celerion, Antidote).
- A site that blocked us might work in a normal browser. We did not try, because the task was to check what automated reading can do.
- Only the US was considered.
