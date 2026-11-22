# Where paid healthy-volunteer studies are listed

Research for a possible clinic feature. Checked on 2026-11-22. Nothing has been built.

**Words.** Terms follow `CONTEXT.md`: a **Trial** is a study registered on ClinicalTrials.gov. A **clinic listing** is an entry on a clinic's own recruitment site. A clinic listing is not a Trial.

**Marks.** Every claim is marked **[V]** (verified: the page or data was read on 2026-11-22 and the source is given) or **[U]** (unverified: from a search-result snippet, a third party, or general knowledge).

**Limits we kept.** We did not log in, submit forms, or accept any cookie or terms banner. Each site got a handful of page requests, not a crawl. "Blocked" means the site refused a plain scripted request (HTTP 403). For blocked sites the research assistant opened the page once in a normal browser window that it controls, to see what a person would see; no challenge appeared and none was got round. That is still a tool, not a person. Once a site's terms were found to forbid automated tools, we stopped reading it; for Trialmed and Medpace the list had been read before the terms were.

## Conclusion

1. **The idea holds for clinic sites, not for volunteer-run sites.** Clinics' own recruitment sites show what ClinicalTrials.gov does not: pay, nights in clinic, visits, and often dates. The volunteer-run sites we expected list clinics, not studies.
2. **About 25 cities hold most of the market.** Over three years, 24 US cities account for 80% of company-run, single-site Phase 1 healthy-volunteer Trials. A travelling volunteer's map is short: Lincoln NE, Tempe AZ, Madison WI, Miami FL, Austin TX, Baltimore MD, San Antonio TX, New Haven CT, Grayslake IL, Salt Lake City UT and a dozen more.
3. **Most clinics forbid automated reading.** Of 31 clinic operators checked, 21 publish a public list of studies. Seven of those forbid bots or scraping in their terms (ICON, CenExel, PPD/Trialmed, Medpace, Parexel, Syneos, Dr. Vince), and one more operator, K2, refuses all crawlers in robots.txt. Three block scripts or need JavaScript, and three have lists with no pay shown or nothing listed that day. Only 8 have a readable list and no rule against it: Altasciences (two sites), Celerion, Fortrea, Orlando Clinical Research Center, Pharmaron, Pfizer New Haven, Novum and TKL Research.
4. **A clinic listing usually cannot be tied to a Trial.** No clinic listing shows an NCT ID. Clinic study codes are internal: 9 codes from five contract clinics found nothing on ClinicalTrials.gov. The exception is clinics owned by a drug company (Pfizer, AbbVie), whose codes are the sponsor's protocol numbers: 3 of 5 tested matched a Trial, though neither of the two codes Pfizer lists today did.
5. **ClinicalTrials.gov may cover these clinics better than expected.** Each clinic has about as many open Trials naming it as it has clinic listings, or more. We could not confirm they are the same studies. US law does not require Phase 1 Trials to be registered, so some will be missing. Of those that are registered, about half are posted before the study starts.
6. **Recommended order of work.** First a clinic directory with hand-kept links. Then a "clinic Watch" that alerts when a new Trial names a chosen clinic, and links to the clinic's own page for pay and dates. Reading clinic lists automatically comes last, and only for the 8 sources above. The owner has decided (2026-11-22) to go ahead with those 8 without asking first; see section 7. Section 6 lists ways to get pay and dates without automation.
7. **Waiting period.** 30 days between studies is the common rule. A tracker can only be a personal reminder: no registry lets volunteers look themselves up.

## 1. Which clinics run the most Trials (ClinicalTrials.gov)

### Today's snapshot [V]

Query: `https://clinicaltrials.gov/api/v2/studies` with
`filter.advanced=AREA[HealthyVolunteers]true AND AREA[Phase](PHASE1 OR EARLY_PHASE1) AND AREA[LocationCountry]"United States"` and `filter.overallStatus=RECRUITING,NOT_YET_RECRUITING`. Run on 2026-11-22; it returned **715 Trials**.

- 256 (36%) have a company as lead sponsor. 399 (56%) are led by universities and hospitals, 52 by NIH.
- 539 (75%) have a single US site.
- The 715 Trials list 1,370 US sites. 1,368 have a map point.
- 147 of those sites (11%) have no real name: "Research Site", "GSK Investigational Site", "Local Institution - 0002". They cannot be tied to a clinic without guessing.
- Named sites are spelled many ways. "CenExel ACT", "CenExel ACT (Formerly Anaheim Clinical Trials; LLC)" and "Anaheim Clinical Trials, LLC" are one Anaheim unit. Grouping them is our judgement, not a fact in the data.
- The single busiest site today is the NIH Clinical Center in Bethesda (33 Trials), followed by Orlando Clinical Research Center (14) and two Boston hospitals. Research hospitals lead the raw count; they are mostly not the paid overnight work.

### Three-year view, by city [V]

To find the dedicated Phase 1 units from data alone, we used a stricter query: the same filters plus `AREA[LeadSponsorClass]INDUSTRY` and `AREA[StudyFirstPostDate]RANGE[2023-11-22,MAX]`, all statuses. It returned **1,081 Trials**; 745 have a single US site. A company Trial with one site is the mark of a Phase 1 unit. We counted those by city, because city names are consistent and facility names are not.

| City | Single-site company Trials, 3 years | Of which first posted in the last 12 months | Main named operators |
|---|---|---|---|
| Lincoln NE | 53 | 19 | Celerion |
| Tempe AZ | 52 | 11 | Celerion |
| Madison WI | 46 | 15 | Fortrea (earlier Labcorp, Covance) |
| Miami FL | 36 | 17 | Quotient Sciences, Clinical Pharmacology of Miami, Syneos Health |
| Austin TX | 35 | 6 | PPD |
| Baltimore MD | 33 | 7 | Pharmaron; Parexel |
| San Antonio TX | 33 | 8 | ICON, Worldwide Clinical Trials |
| New Haven CT | 32 | 15 | Pfizer Clinical Research Unit |
| Grayslake IL | 30 | 15 | AbbVie Clinical Pharmacology Research Unit |
| Salt Lake City UT | 29 | 14 | ICON |
| Glendale CA | 29 | 7 | Parexel; 12 unnamed |
| Anaheim CA | 28 | 11 | CenExel ACT (Anaheim Clinical Trials) |
| Lenexa KS | 25 | 8 | ICON |
| Daytona Beach FL | 20 | 7 | Fortrea |
| Dallas TX | 20 | 4 | Fortrea |
| Overland Park KS | 19 | 7 | Dr. Vince Clinical Research; Altasciences |
| Cypress CA | 17 | 4 | Altasciences |
| Las Vegas NV | 17 | 7 | PPD, Novum |
| Brooklyn MD | 12 | 2 | all unnamed |
| South Miami FL | 11 | 3 | QPS |
| Cincinnati OH | 9 | 4 | Medpace |
| Secaucus NJ | 7 | 2 | Frontage |
| Saint Paul MN | 7 | 2 | Nucleus Network |
| Los Alamitos CA | 7 | 4 | CenExel CNS |

These 24 cities hold 80% of the 745; 96 cities appear in all. Smaller units follow: Fair Lawn NJ (TKL Research), San Diego and Chula Vista CA (ProSciento), Dilworth MN (Axis Clinicals), Springfield MO (QPS), Columbus OH, Anniston AL, Honolulu HI.

Unnamed sites are 99 of the 745 single-site Trials (13%). Whole clinics hide there: every Brooklyn MD Trial is unnamed.

**Which clinics we checked.** Every named operator in the table, the next few by count, the NIH Clinical Center, the Johns Hopkins Behavioral Pharmacology Research Unit, and four Florida operators that ranked high in today's snapshot (Floridian, Genesis, K2, Charter Research). That is 31 operators in all. The four Florida operators' Trials are mostly kidney or liver impairment studies with matched healthy people, or Alzheimer's studies with a healthy arm [V, Trial titles].

## 2. Clinic recruitment sites

"Plain HTML" can be read with a simple request. "Needs JavaScript" means the studies only appear after scripts run in a browser. Quotes are the sites' own words.

### A. Public list, readable, nothing found that forbids automated reading

| Clinic (cities) | Study list | What a listing shows | Own code; NCT ID | Form and robots.txt | Terms |
|---|---|---|---|---|---|
| **Celerion** (Lincoln NE, Tempe AZ) | [helpresearch.com/studies](https://helpresearch.com/studies) [V] | Pay "$3,750*"; start and end dates; age; sex. Detail page: BMI "19 - 32", "4 Night Stay & 1 Return" | Yes (CA52371-3); no NCT | Plain HTML. Allowed; crawl delay 10 s | No terms page found; parent site links only "Privacy & Legal" [V] |
| **Fortrea** (Madison WI, Dallas TX, Daytona Beach FL, San Antonio TX) | [fortreaclinicaltrials.com/…/browse-studies](https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies) [V] | Pay "$3,552"; dates "Dec 07 2026 - Dec 16 2026"; "1 stay of 5 nights & 1 follow-up visit"; age; smokers; city | Yes ("778951 9b"); no NCT | Plain HTML. Allowed. An RSS feed (/rss.xml) carries the 10 newest pages; the sitemap has change dates [V] | The only "terms" page is a supplier contract [V] |
| **Altasciences** (Overland Park KS) | [participantskc.altasciences.com/available-studies](https://participantskc.altasciences.com/available-studies) [V] | Pay "$ 5 550"; dates "1 to 5 Dec"; return visits; age; sex; smoking. Detail: BMI, "5 days/4 nights" | Yes (N49); no NCT | Plain HTML. Allowed; crawl delay 10 s | Privacy and cookie pages only [V] |
| **Altasciences** (Cypress CA) | [participantsla.altasciences.com/current-studies](https://participantsla.altasciences.com/current-studies) [V] | Pay "up to $8,950"; "three 4-night stays"; age; sex; BMI where it matters. 26 listings over 3 pages | Yes (N-40700); no NCT | Plain HTML. Allowed. Sitemap lists each study page with a change date [V] | Privacy and cookie pages only [V] |
| **Orlando Clinical Research Center** (Orlando FL) | [ocrc.net/current-studies](https://ocrc.net/current-studies/) [V] | Detail page: "up to $4,025 for time and travel", "6 days and 5 nights", age. Mostly kidney and liver impairment studies | Letter code (V4); no NCT | Plain HTML. Allowed. A sitemap lists the 6 study pages with change dates [V] | No terms page [V] |
| **Pharmaron** (Baltimore MD) | [pharmaron.com/…/clinical-trial-recruitment-us](https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/) [V] | "compensated up to $8,100"; "18 days/17 nights"; age; sex | Name only (CHESAPEAKE); no NCT | Plain HTML, one page. Allowed | Privacy notice only [V] |
| **Pfizer Clinical Research Unit** (New Haven CT) | [pfizerclinicaltrials.com/our-research/pcru-new-haven](https://www.pfizerclinicaltrials.com/our-research/pcru-new-haven) [V] | "Up to $3,350 upon completion"; age; sex; visits on detail page. 3 listings | **Sponsor's protocol number** (C6381001), which can match a Trial; no NCT shown | Plain HTML. Allowed | No bot clause. Has a copying limit: "may not be copied other than for noncommercial individual reference" ([Terms](https://www.pfizer.com/general/terms)) [V] |
| **Novum** (Las Vegas NV) | [gonovum.com/location/las-vegas](https://www.gonovum.com/location/las-vegas/) [V] | Pay "$2,700"; dates "01/13/27 - 02/22/27"; age; sex; visits on detail. Outpatient studies | Yes ("12641901 Group6"); no NCT | Plain HTML. Allowed | No terms page found [V] |
| **TKL Research** (Fair Lawn NJ) | [tklresearch.com/studies](https://tklresearch.com/studies/) [V] | "$6,400 FOR TIME AND TRAVEL"; start date; "15 OVERNIGHTS AND 4 OUTPATIENT VISITS"; age; sex | Yes (P1980126); no NCT | Plain HTML. Allowed | [Terms](https://tklresearch.com/privacy-policy-terms-use/) have no bot or scraping clause [V] |

"Nothing found that forbids it" is not permission. Fortrea and Celerion have no website terms at all that we could find; that is silence, not consent.

### B. Public list, but automated reading is forbidden

| Clinic (cities) | Study list | What a listing shows | Why not |
|---|---|---|---|
| **ICON** (Salt Lake City UT, Lenexa KS, San Antonio TX) | [iconstudies.com/All-Clinical-Research-Studies](https://iconstudies.com/All-Clinical-Research-Studies/) [V] | "Up to $10500"; "1 stay of 6 nights and 6 outpatient visits"; age; sex; own code | Terms: "Use any bots, spiders, trojans, worms, spyware" is prohibited ([Terms](https://iconstudies.com/Terms-of-Use/)) [V] |
| **CenExel** (Anaheim CA, Los Alamitos CA, Decatur GA, Marlton NJ, Englewood CO) | Per unit, e.g. [cenexelresearch.com/act/all-studies](https://cenexelresearch.com/act/all-studies/) [V] | "up to $9,500" or "TBD"; age; sex. No dates, nights or code | Central site terms: "engage in or use any data mining, robots, scraping" ([Terms](https://cenexelclinicaltrials.com/privacy-policy-and-terms/)) [V]. The unit pages link only a privacy policy, so whether the ban covers them is unclear; study pages redirect to the central site |
| **PPD**, now shown as **Trialmed** (Austin TX, Las Vegas NV, and other cities) | ppd.com redirects to [trialmed.com/find-a-study](https://trialmed.com/find-a-study/) [V, browser]. 58 listings | "Up to $30100"; age; sex; BMI; smoker; start; city | Blocked to scripts. Terms: "You agree not to use any automated tool, such as a web scraping tool" ([Terms](https://trialmed.com/terms-of-use/)) [V] |
| **Medpace** (Cincinnati OH) | [medpace.com/study-participants/browse-studies](https://www.medpace.com/study-participants/browse-studies/) [V, browser] | Pay in the title ("Healthy Adults, Age 18-64, $4,150"); "four outpatient visits … plus one separate 6-night stay"; age; BMI | Blocked to scripts. Terms: "any use of data mining, robots, or similar data gathering and extraction tools" ([Terms](https://www.medpace.com/terms-of-use/)) [V] |
| **Parexel** (Baltimore MD, Glendale CA) | A Salesforce portal, e.g. [Baltimore list](https://pxlcrs.my.site.com/portal/s/trials-listing-bal?loc=BAL&language=en_US) [V, browser] | "Compensation up to: $24,250"; "1 in-house stay of 16-days/15-nights, and 13 outpatient visits"; age; own code | Needs JavaScript. Terms: "high-volume or automated use of this Website is prohibited" ([Terms](https://www.parexel.com/about-us/trust-and-privacy/terms)) [V] |
| **Syneos Health** (Miami FL) | [us-participants.syneoshealth.com/en/avalaible-studies](https://www.us-participants.syneoshealth.com/en/avalaible-studies/) [V] (the misspelling is theirs) | "Up to $2,965"; dates; "1 overnight stay (8 nights) and 1 return visit"; age; sex; own code; status | Terms: "data mining, robots, or similar data-gathering or extraction methods" ([Terms](https://www.syneoshealth.com/syneos-health-website-terms-use)) [V] |
| **Dr. Vince Clinical Research** (Overland Park KS) | [drvince.com/current-studies](https://drvince.com/current-studies/) [V, browser] | Not read after the terms were found | Blocked to scripts. Terms forbid users to "scrape or systematically extract Site content" without permission, while allowing search engines to index it ([Terms](https://drvince.com/terms-and-conditions-of-use/)) [V]. ClinicalTrials.gov gives it the same ZIP code as Altasciences Kansas City; whether the two are linked is unclear |
| **K2 Medical Research** (Maitland FL) | Not read | – | robots.txt disallows everything, for all crawlers [V] |

### C. A person can open it; scripts are blocked or it needs JavaScript

| Clinic (cities) | Study list | What a listing shows | Notes |
|---|---|---|---|
| **QPS** (South Miami FL) | [miamiresearch.com](https://miamiresearch.com/) [V, browser] | "Receive up to $4,325"; age; BMI; visits; own study number | Blocked to scripts though robots.txt allows all. Privacy policy only |
| **ProSciento** (Chula Vista CA) | [myproscientostudy.com/current-studies](https://myproscientostudy.com/current-studies/) [V, browser] | "Up to 88 days", "Up to $5,075"; 4 listings, 1 healthy | Blocked to scripts; crawl delay 10 s. [Terms](https://prosciento.com/terms-of-use/) have no bot clause [V] |
| **Nucleus Network** (Saint Paul MN) | [nucleusnetwork.com/participants/find-a-trial](https://www.nucleusnetwork.com/participants/find-a-trial/) [V] | Pay and stay on detail pages [U] | Needs JavaScript; the data request needs a signed token. Terms have no bot clause [V] |
| **Quotient Sciences** (Miami FL) | [weneedyoutrials.com/us/current-trials](https://www.weneedyoutrials.com/us/current-trials) [V] | "No trials found" on the day | Unclear what a listing shows |
| **NIH Clinical Center** (Bethesda MD) | [os1.cc.nih.gov/recruit/protocols](https://os1.cc.nih.gov/recruit/protocols?f%5B0%5D=healthy_volunteer%3A1) [V], 84 healthy-volunteer studies | Title, short text, NIH study number. No pay, dates or nights | Plain HTML on this host; the main www.cc.nih.gov host was blocked. No bot clause [V] |
| **Johns Hopkins BPRU** (Baltimore MD) | [hopkinsmedicine.org/…/bpru/research-volunteers](https://www.hopkinsmedicine.org/psychiatry/research/bpru/research-volunteers) [V, browser] | Paragraphs of text with age, visits and a phone number | Blocked to scripts |

### D. No public list of studies

- **AbbVie** (Grayslake IL): blocked. Its study pages use protocol numbers that match Trials (section 4) [V].
- **QUEST Research Institute** (Farmington Hills MI): sign-up and FAQ only [V, browser].
- **Clinical Pharmacology of Miami**: the studies page was empty; it points volunteers to an app [V, browser].
- **Frontage** (Secaucus NJ): general sign-up cards; study details only in PDF flyers [V].
- **Genesis Clinical Research** (Tampa FL): general pages for healthy, kidney and liver volunteers [V].
- **Charter Research** (Orlando FL): 11 listings, all patient studies [V].
- **Worldwide Clinical Trials** (San Antonio TX), **Floridian Clinical Research** (Miami Lakes FL): no volunteer site found [V].
- **Axis Clinicals** (Dilworth MN): blocked [V].

### Notes

- **robots.txt** allows the study list on every site except K2. It says what crawlers may fetch. It does not override terms of use.
- **AI crawler rules.** Syneos, AbbVie, K2 and ClinicalConnection name AI crawlers (GPTBot, ClaudeBot and others) in robots.txt and refuse them [V].
- **Pay is "up to"** almost everywhere [V]. It is probably the amount for finishing the whole study [U].
- **Closed studies stay listed** on some sites; Altasciences marks them "Recruitment Complete" [V].
- **Feeds.** No site offers its studies as data (no JSON, no study RSS). Fortrea's RSS and the sitemaps at Fortrea, Altasciences LA and Orlando Clinical Research Center show when a study page was added or changed [V].

### One-day pay snapshot [V]

From listings read on 2026-11-22. These are "up to" amounts, a single day's sample, and not a forecast of income.

| Clinic listing | Pay | Time asked |
|---|---|---|
| Fortrea 778951 (Madison) | $3,552 | 1 stay of 5 nights, 1 follow-up visit |
| Fortrea 782640 (Madison) | $10,784 | 1 stay of 20 nights, 1 follow-up visit |
| Fortrea 783028 (Daytona Beach) | $11,988 | 1 stay of 9 nights, 8 outpatient visits |
| Fortrea 5109595 (San Antonio) | $44,900 | 7 stays totalling 58 nights, 25-27 visits, over 17 months |
| Altasciences N-40700 (Cypress) | up to $8,950 | three 4-night stays, 1 follow-up call |
| Altasciences N-41200 (Cypress) | up to $11,550 | a 15-night stay, 1 outpatient visit |
| Celerion CA52371-3 (Lincoln) | $3,000 | check-in Nov 29, out Dec 07 |
| Medpace | $4,150 | 4 outpatient visits, one 6-night stay |
| Parexel 296518 (Baltimore) | up to $24,250 | 16 days/15 nights, 13 outpatient visits |

For the listings that are nearly all overnight stays, pay divided by nights comes to roughly $540 to $770 a night (our arithmetic, from the first, second, fifth and sixth rows).

## 3. Sites that gather listings across clinics

| Site | What it is | Listing contents | Automated reading |
|---|---|---|---|
| **JustAnotherLabRat** ([jalr.org](https://jalr.org/)) | Run by an individual, with ads. A directory of about 60 US Phase 1 clinics by state: beds, amenities, pay method, recruiting phone [V] | No per-study pay or dates. Its "studies" link goes to Study Scavenger. Newest feed item is from 2019 [V] | robots.txt allows all; [disclaimer](https://jalr.org/disclaimer.html) does not address it [V] |
| **Study Scavenger** ([studyscavenger.com](https://studyscavenger.com/)) | Commercial. Clinics pay it to recruit; volunteers search free, also by app. Offers a "Healthy Volunteer Studies only" search and a minimum-pay filter [V] | Unclear: results need a search form, which we did not submit | Not addressed in so many words. Its [licence](http://www.studyscavengeradmin.com/Content/Eula.aspx) claims "all data, information, and tables created by SS" and forbids copying [V]. Ask first: info@studyscavenger.com |
| **CenterWatch** ([listings](https://www.centerwatch.com/clinical-trials/listings)) | Commercial; about 40,000 trials by condition [V] | Unclear whether pay or nights are shown | robots.txt: crawl delay 10 s, search paths disallowed [V]. Terms page blocked |
| **ClinicalConnection** | Commercial lead generation | Blocked | robots.txt refuses named AI crawlers [V] |
| **Antidote** ([antidote.me](https://www.antidote.me/)) | Commercial patient matching | Not reviewed | **Forbidden**: "systematic or automated data collection activities" ([Terms](https://www.antidote.me/terms-of-use)) [V] |
| **Reddit** | r/clinicaltrials and r/PaidStudies are said to exist [U] | Blocked to us | Unclear |

No free site gathers per-study pay, dates and nights across clinics. We found no active volunteer forum we could confirm. JustAnotherLabRat's clinic list is a useful cross-check for the directory.

## 4. Can a clinic listing be tied to a Trial?

**By code: no for contract clinics, yes for drug-company clinics [V].**
- We searched ClinicalTrials.gov's study ID fields and full text for 9 codes: Fortrea (781236, 783564, 778951, 5109595), Celerion (CA48121, CA52371), Altasciences (N-40700), ICON (0078-2765) and Pharmaron (CHESAPEAKE). None matched the right Trial.
- Pfizer and AbbVie use the sponsor's own protocol number. Of five codes tested, three matched: C4921001 (NCT05654181, New Haven), M25-431 (NCT07425899, Grayslake) and M25-776 (NCT07306754, Grayslake). The two codes on Pfizer's list today, C6381001 and C6508912, matched nothing; they may not be registered yet.

**By unit, age and sex: sometimes [V].** For each clinic listing we counted the open Trials that name the same unit and have the same age range and sex.
- Fortrea, 6 listings: 3 had exactly one candidate Trial, 2 had none, 1 had four.
- Celerion Lincoln, 5 listings: 1 had exactly one candidate, 4 had four each. Celerion advertises ages from 19 where the Trial says 18, so even the age needs loosening.
- A single candidate is still a guess. We could not confirm any of them.

**Coverage: the counts are comparable [V].** Open Trials naming the unit, against distinct clinic listings on the day:

| Unit | Open Trials naming it | Distinct clinic listings |
|---|---|---|
| Celerion, Lincoln | 8 | 5 |
| Fortrea, Madison | 6 | 3 |
| Fortrea, Daytona Beach | 12 | 4 |
| Altasciences, Overland Park | 5 | 5 |
| Pharmaron, Baltimore | 4 | 5 |
| Orlando Clinical Research Center | 18 | 6 |

Clinics seem to advertise only the groups they are filling now, so their lists are shorter [U]. Trials with an unnamed site are not counted and would add to the left column. Equal counts do not prove these are the same studies: two Fortrea listings had no candidate Trial at all, and Pfizer's two current codes are not registered.

**The law [V].** Phase 1 drug studies are outside the registration rule: an applicable drug clinical trial is one "other than a phase 1 clinical investigation" ([42 CFR 11.10](https://www.ecfr.gov/current/title-42/part-11/subpart-A/section-11.10)). So registration of these Trials is voluntary, and some studies will never appear.

**Timing [V].** For 734 single-site company Trials from the three-year set, we compared the day the Trial was first posted with its start date.
- 26% were posted two weeks or more before the start.
- 22% were posted in the two weeks before the start.
- 18% were posted up to two weeks after.
- 9% were posted 15 to 30 days after, and 25% more than 30 days after.

So an Alert from ClinicalTrials.gov arrives in useful time for about half to two-thirds of these Trials. Two limits: this counts only studies that are registered and name their site, and it is measured against the start date, while clinics begin recruiting some weeks earlier [U]. On the other side, a clinic recruits group after group for months, so a late Alert often still helps [U].

## 5. Waiting periods ("washout") and no-show rules

**What clinics say.**
- Celerion: "we require at least a 30-day washout period" between studies ([page](https://helpresearch.com/learn/what-is-a-washout-period)) [V]; its FAQ says typically 30 days, sometimes 90 [V].
- Fortrea: "one study at a time, usually with one month in between" ([FAQ](https://www.fortreaclinicaltrials.com/en-us/clinical-research/frequently-asked-questions-about-clinical-trials)) [V].
- Syneos: a "required waiting time before you can enroll in another study"; length varies ([FAQ](https://www.us-participants.syneoshealth.com/en/faq/)) [V].
- Frontage: "there is a limit to how often volunteers can participate" ([FAQ](https://www.frontagelab.com/enroll-in-a-study/faqs/)) [V]. No number given.
- ICON, CenExel, QPS Miami and Altasciences (FAQs): nothing on a waiting period [V].

**Penalties that also cost time [V].**
- Fortrea: after missed screening appointments a volunteer "may be restricted from participating in all Fortrea studies for 3 months"; a third miss can mean a permanent bar ([policy](https://www.fortreaclinicaltrials.com/en-us/volunteer-no-show-policy)).
- Altasciences Kansas City: after withdrawing or missing a follow-up visit, "there may be a 30-day waiting period after the end of study visit" before screening again. A positive drug screen brings 30 days, then 60, then a possible permanent bar ([guidelines](https://participantskc.altasciences.com/study-guidelines)).

**What Trial rules say [V].** From the eligibility text of today's 715 Trials (a simple text search, so approximate):
- 182 state a window after another study drug. 132 say 30 days or less, 10 up to 60 days, 19 up to 90, and 21 longer.
- Of all 715, 125 mention "5 half-lives": the wait is longer for slow-clearing drugs. Typical wording: "within 30 days of Screening or 5 drug half-lives, whichever is longer" (NCT07882472).
- Of all 715, 97 limit recent blood or plasma donation.
- Among the 138 company single-site Trials, 70 state a window: 51 say 30 days or less, 14 say 31 to 90, 5 longer.
- Where the wording was clear, the window is counted back from the first dose or check-in of the new Trial (35 Trials) more often than from its screening visit (12).

The two sources count from different points. Clinics count from the end of the previous study (Celerion: "the conclusion of one study"; Altasciences: "the end of study visit"). Trial rules count from the last study drug taken. A tracker should ask the Member for both dates, use the later one, add 30 days by default, and let the Member change the number.

**Registries that detect overlapping enrolment.**
- **Verified Clinical Trials** ([site](https://verifiedclinicaltrials.com/)) [V]. Commercial. Clinics check each volunteer at screening. It stores "partial identifiers such as initials and date of birth", encrypted, with optional fingerprint or face checks. It claims Phase 1 units among its users in "34+" or "over 50" countries; its pages disagree. It names no clinics and publishes no figures. Its volunteer FAQ offers no way to see your own record.
- **clinicalRSVP** ([site](https://www.clinicalrsvp.com/)) [V]. Commercial; fingerprint ID; tracks enrolment dates and washouts. No volunteer view found.
- No clinic page we read, and none of the 715 Trials' eligibility texts, names a registry [V]. Clinics may still use one.
- A 2012 paper reports that clinicalRSVP saw 12-18% of screening attempts come before the washout had passed, and that in one small US survey "10% admitted to being dually enrolled" ([PMC5164923](https://pmc.ncbi.nlm.nih.gov/articles/PMC5164923/)) [V].
- The same paper says NIH and FDA "do not strictly limit the number of studies" a volunteer joins; US registries are private and voluntary [V]. A 2025 paper says the UK's register is mandatory and calls for the same elsewhere ([author copy](https://repository.uwl.ac.uk/id/eprint/13979/)) [V].

**Tax, since the idea is income [V].** Duke University's review board says "all research payments remain taxable income", and that from 2026-01-01 payments of $2,000 or more in a year are reported on Form 1099, up from $600 ([notice](https://irb.duhs.duke.edu/news/tax-reporting-requirement-threshold-update-01012026)). We did not read the IRS's own page.

## 6. Getting pay and dates when automation is forbidden

The terms forbid a program fetching the clinic's site. They do not stop a person reading it, the clinic telling us, or use of data the clinic publishes elsewhere.

1. **A clinic Watch on ClinicalTrials.gov.** Alert when a new Phase 1 healthy-volunteer Trial names a chosen clinic or city, and link to that clinic's own study list for pay and dates. All of it uses data we may read. Section 4 gives the catch rate and its limits: about half to two-thirds of registered Trials in time. Unnamed sites are missed unless the Watch is by city.
2. **Let the clinic tell the Member.** Clinics run their own email and text lists, and some have apps (Medpace offers text messages; Clinical Pharmacology of Miami has an app) [V]. The Member signs up with the clinic. GuineaPing only supplies the sign-up links.
3. **Members share what they read.** A Member who sees a clinic listing enters the link, pay and dates for the group. A person read the page; the app stores what they typed. Shared entries must be the clinic's own words, not a summary.
4. **Ask for permission.** Clinics pay for referrals (Altasciences LA advertises "up to $1,000 per referral") [V], so a group of willing volunteers is something they want. Known contacts: ptinfo@altasciences.com, study.baltimore@parexel.com, hello@myproscientostudy.com, info@studyscavenger.com [V]; the others have contact forms.
5. **A licensed feed.** Study Scavenger is paid by clinics to spread their listings. Whether it would license a feed is unknown [U].
6. **A reminder, not a fetch.** A weekly push: "check these clinic lists near you", with links.

Ruled out: making a program look like a browser, running requests through Members' browsers, or reading the pages through a search engine's copy. These break the same terms another way. CenExel's terms also forbid getting round a block [V].

## 7. Recommendation

**Step 1, clinic directory: do it.**
- Build the list from the three-year city table in section 1, not from one day's data.
- ClinicalTrials.gov gives the city and a map point for nearly every site. It does not give the recruitment website, and 11-13% of sites are unnamed. So keep a small hand-made list: one row per clinic unit with name, city, map point, study-list link and sign-up link. Section 2 gives about 25 links.
- Upkeep: check the links a few times a year. Clinics rename (Covance → Labcorp → Fortrea; PPD → Trialmed) and move their volunteer sites to new addresses.

**Step 1½, clinic Watch: do it next.** It needs no permission and reuses Watches and Alerts. It needs facility names grouped per clinic, or matching by city. The glossary would gain a term for a clinic.

**Step 2, washout tracker.** A personal reminder as described in section 5. It cannot check any registry.

**Step 3, reading clinic lists: last, and narrow.**
- Candidates: the 8 operators in table A.
- **Decision (owner, 2026-11-22): assume permission for these 8.** The reasons given: GuineaPing is a private group, it is not a paid app, and building it does not need the collected listings. This is the owner's judgement, not something the clinics have said. It fits these 8 because their sites are silent on automated reading.
- It does not stretch to table B. Those sites say no in writing, and their terms make no exception for free or private use. They stay out unless a clinic agrees.
- Conditions that keep the assumption reasonable: send a User-Agent that names GuineaPing and gives a contact address; follow robots.txt and crawl delays; read each list at most once a day; show the clinic's own words with a link back to its page; keep listings inside the Member group; stop at once if a clinic blocks the reader or asks. Pfizer's terms limit copying to "noncommercial individual reference", so for Pfizer show a link and the headline facts only.
- Not candidates without written permission: tables B, C and D.
- Sitemaps and Fortrea's RSS can show that something changed without re-reading every page.
- Upkeep: one reader per site. A redesign silently breaks a reader, so each needs a check that it still finds listings. Expect one or two repairs a year [U, estimate].
- Clinic listings would be a separate thing from Trials, since they cannot be joined, except at drug-company units. The glossary would need a term for them.

## Method and limits

- ClinicalTrials.gov queries and counts were run by script on 2026-11-22. Grouping of facility names is our judgement.
- Clinic pages were fetched with plain requests on 2026-11-22, saved, and searched. Research helpers did part of this; key quotes were checked again against the saved pages.
- Pages marked "[V, browser]" were opened once in an ordinary browser because scripts were refused.
- The listing-to-Trial matching was done on two clinics by hand; it is a small sample.
- Only the US was considered.
