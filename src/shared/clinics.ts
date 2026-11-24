/**
 * The Clinics GuineaPing knows: research units that run paid studies for healthy volunteers. Kept
 * by hand, from docs/research/paid-study-sources.md.
 *
 * `source` names the reader that fetches this Clinic's study list once an hour (src/worker/openings).
 * A Clinic without one is never visited: its terms forbid automated tools, it turns them away, or
 * GuineaPing has no address for its list. The Member opens the link, if there is one, and reads it
 * themselves. Every Clinic can be named in a Watch, which asks ClinicalTrials.gov, not the Clinic.
 */
export type SourceId = "fortrea" | "celerion" | "altasciences-kc" | "altasciences-la" | "pharmaron" | "ocrc" | "pfizer" | "novum" | "tkl" | "dr-vince" | "syneos" | "axis" | "cenexel" | "prosciento" | "abbvie";

export type Clinic = {
  id: string;
  name: string;
  /** "City, ST" */
  place: string;
  lat: number;
  lon: number;
  /**
   * The Clinic's own list of studies, for a Member to open. Null when no address for it has been
   * confirmed: the Clinic is still listed, and a Watch can still name it, with nothing to open.
   */
  url: string | null;
  source: SourceId | null;
  /**
   * How Trial listings on ClinicalTrials.gov name this Clinic: words found in the site names used
   * in its city over three years (checked 2026-11-22). Listings spell a Clinic many ways and some
   * give no name at all ("Research Site"), so this finds most of a Clinic's Trials, not all.
   */
  names: string[];
  /** The cities listings put it in; its own city unless stated. */
  cities: string[];
};

const c = (id: string, name: string, place: string, lat: number, lon: number, url: string | null, source: SourceId | null, names: string[], cities: string[] = [place.split(",")[0]!]): Clinic => ({
  id,
  name,
  place,
  lat,
  lon,
  url,
  source,
  names,
  cities,
});

/** Fortrea's units were Covance, then Labcorp, and listings still use all three names. */
const FORTREA_NAMES = ["Fortrea", "Covance", "Labcorp"];
/** Trialmed is the new name of PPD's units. */
const TRIALMED_NAMES = ["Trialmed", "PPD"];

const FORTREA = "https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies";
const CELERION = "https://helpresearch.com/studies";
const ICON = "https://iconstudies.com/All-Clinical-Research-Studies/";
const TRIALMED = "https://trialmed.com/find-a-study/";

export const CLINICS: Clinic[] = [
  // Read once an hour.
  c("celerion-lincoln", "Celerion", "Lincoln, NE", 40.8, -96.667, CELERION, "celerion", ["Celerion"]),
  c("celerion-tempe", "Celerion", "Tempe, AZ", 33.4148, -111.9093, CELERION, "celerion", ["Celerion"]),
  c("fortrea-madison", "Fortrea", "Madison, WI", 43.0731, -89.4012, FORTREA, "fortrea", FORTREA_NAMES),
  c("fortrea-dallas", "Fortrea", "Dallas, TX", 32.7831, -96.8067, FORTREA, "fortrea", FORTREA_NAMES),
  c("fortrea-daytona", "Fortrea", "Daytona Beach, FL", 29.2108, -81.0228, FORTREA, "fortrea", FORTREA_NAMES),
  c("fortrea-san-antonio", "Fortrea", "San Antonio, TX", 29.4241, -98.4936, FORTREA, "fortrea", FORTREA_NAMES),
  c("altasciences-kc", "Altasciences", "Overland Park, KS", 38.9822, -94.6708, "https://participantskc.altasciences.com/available-studies", "altasciences-kc", ["Altasciences"]),
  c("altasciences-la", "Altasciences", "Cypress, CA", 33.817, -118.0373, "https://participantsla.altasciences.com/current-studies", "altasciences-la", ["Altasciences"]),
  c("ocrc", "Orlando Clinical Research Center", "Orlando, FL", 28.5383, -81.3792, "https://ocrc.net/current-studies/", "ocrc", ["Orlando Clinical Research Center", "OCRC"]),
  c("pharmaron", "Pharmaron", "Baltimore, MD", 39.2904, -76.6122, "https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/", "pharmaron", ["Pharmaron"]),
  c("pfizer-new-haven", "Pfizer Clinical Research Unit", "New Haven, CT", 41.3081, -72.9282, "https://www.pfizerclinicaltrials.com/our-research/pcru-new-haven", "pfizer", ["Pfizer", "New Haven Clinical Research Unit"]),
  c("novum-las-vegas", "Novum", "Las Vegas, NV", 36.175, -115.1372, "https://www.gonovum.com/location/las-vegas/", "novum", ["Novum"]),
  c("tkl-fair-lawn", "TKL Research", "Fair Lawn, NJ", 40.9404, -74.1318, "https://tklresearch.com/studies/", "tkl", ["TKL"]),
  // Link only.
  c("icon-salt-lake-city", "ICON", "Salt Lake City, UT", 40.7608, -111.8911, ICON, null, ["ICON"]),
  c("icon-lenexa", "ICON", "Lenexa, KS", 38.9536, -94.7336, ICON, null, ["ICON"]),
  c("icon-san-antonio", "ICON", "San Antonio, TX", 29.4241, -98.4936, ICON, null, ["ICON"]),
  c("cenexel-anaheim", "CenExel ACT", "Anaheim, CA", 33.8353, -117.9145, "https://cenexelresearch.com/act/all-studies/", "cenexel", ["CenExel", "Anaheim Clinical Trials"]),
  c("cenexel-los-alamitos", "CenExel CNS", "Los Alamitos, CA", 33.8031, -118.0726, "https://cenexelresearch.com/cns/all-studies/", "cenexel", ["CenExel", "Collaborative Neuroscience"]),
  c("cenexel-decatur", "CenExel iResearch", "Decatur, GA", 33.7748, -84.2963, "https://cenexelresearch.com/iresearch-atlanta/all-studies/", "cenexel", ["CenExel", "iResearch"]),
  c("cenexel-marlton", "CenExel HRI", "Marlton, NJ", 39.8912, -74.9218, "https://cenexelresearch.com/hri/all-studies/", "cenexel", ["CenExel", "Hassman"]),
  c("trialmed-austin", "Trialmed (PPD)", "Austin, TX", 30.2672, -97.7431, TRIALMED, null, TRIALMED_NAMES),
  c("trialmed-las-vegas", "Trialmed (PPD)", "Las Vegas, NV", 36.175, -115.1372, TRIALMED, null, TRIALMED_NAMES),
  c("medpace", "Medpace", "Cincinnati, OH", 39.1271, -84.5144, "https://www.medpace.com/study-participants/browse-studies/", null, ["Medpace"]),
  c("parexel-baltimore", "Parexel", "Baltimore, MD", 39.2904, -76.6122, "https://pxlcrs.my.site.com/portal/s/trials-listing-bal?loc=BAL&language=en_US", null, ["Parexel"]),
  c("syneos-miami", "Syneos Health", "Miami, FL", 25.7743, -80.1937, "https://www.us-participants.syneoshealth.com/en/avalaible-studies/", "syneos", ["Syneos"]),
  c("dr-vince", "Dr. Vince Clinical Research", "Overland Park, KS", 38.9822, -94.6708, "https://drvince.com/current-studies/", "dr-vince", ["Vince"]),
  c("qps-miami", "QPS", "South Miami, FL", 25.7076, -80.2934, "https://miamiresearch.com/", null, ["QPS", "Quest Pharmaceutical Services"], ["South Miami", "Miami"]),
  c("quotient-miami", "Quotient Sciences", "Miami, FL", 25.7743, -80.1937, "https://www.weneedyoutrials.com/us/current-trials", null, ["Quotient"]),
  c("prosciento", "ProSciento", "Chula Vista, CA", 32.6401, -117.0842, "https://myproscientostudy.com/current-studies/", "prosciento", ["ProSciento"], ["Chula Vista", "San Diego"]),
  c("nucleus-saint-paul", "Nucleus Network", "Saint Paul, MN", 44.9444, -93.0933, "https://www.nucleusnetwork.com/participants/find-a-trial/", null, ["Nucleus Network", "Prism Research"]),
  c("nih-clinical-center", "NIH Clinical Center", "Bethesda, MD", 38.9807, -77.1003, "https://www.cc.nih.gov/recruit/protocols", null, ["National Institutes of Health Clinical Center", "NIH Clinical Center"]),
  // Listings mostly call this Clinic "Acpru /Id# …" and seldom use AbbVie's name (checked 2026-11-24).
  c("abbvie-grayslake", "AbbVie", "Grayslake, IL", 42.3445, -88.0418, "https://abbviephase1.com/#/available-trials", "abbvie", ["ACPRU", "AbbVie"]),
  c("johns-hopkins-bpru", "Johns Hopkins BPRU", "Baltimore, MD", 39.2904, -76.6122, "https://www.hopkinsmedicine.org/psychiatry/research/bpru/research-volunteers", null, ["Behavioral Pharmacology Research Unit", "BPRU"]),

  // Added on 2026-11-24 from docs/research/paid-study-sources.md. Names are the spellings listings
  // used that day. The links are the addresses the owner gave; GuineaPing has not opened them.
  c("clinical-pharmacology-miami", "Clinical Pharmacology of Miami", "Miami, FL", 25.7743, -80.1937, "https://cpmiclinical.com/studies/#!/", null, ["Clinical Pharmacology of Miami", "CPMI"], ["Miami", "Hialeah"]),
  c("qps-springfield", "QPS", "Springfield, MO", 37.2153, -93.2982, "https://www.facebook.com/share/1PpbLQQ92a/", null, ["QPS", "Bio-Kinetic", "BioKinetic"]),
  // "Worldwide Clinical", not the whole name: listings also write "Trial" and "Trails".
  c("worldwide-san-antonio", "Worldwide Clinical Trials", "San Antonio, TX", 29.4241, -98.4936, null, null, ["Worldwide Clinical"]),
  c("parexel-glendale", "Parexel", "Glendale, CA", 34.1425, -118.2551, "https://pxlcrs.my.site.com/portal/s/triallistla?loc=LA&language=en_US", null, ["Parexel", "California Clinical Trials", "CCTMG", "EPCU"]),
  // "Genesis Clinical", so that Tampa General Hospital's "Genesis Clinic" is not taken for it.
  c("genesis-tampa", "Genesis Clinical Research", "Tampa, FL", 27.9475, -82.4584, null, null, ["Genesis Clinical"]),
  c("frontage-secaucus", "Frontage", "Secaucus, NJ", 40.7895, -74.0565, null, null, ["Frontage"], ["Secaucus", "Hackensack"]),
  // "Floridian Research Institute" and "Floridian Neuroscience Institute" are left out: the spellings don't show they are this Clinic.
  c("floridian-miami-lakes", "Floridian Clinical Research", "Miami Lakes, FL", 25.9087, -80.3087, null, null, ["Floridian Clinical Research"], ["Miami Lakes", "Hialeah", "Miami"]),
  c("axis-dilworth", "Axis Clinicals", "Dilworth, MN", 46.8766, -96.7034, "https://axispays.com/browse-current-studies/", "axis", ["Axis"]),
  // A different company from Axis Clinicals. Its other places (New Hyde Park NY, Westchester IL) are not listed.
  c("axis-los-angeles", "Axis Clinical Trials", "Los Angeles, CA", 34.0522, -118.2437, null, null, ["Axis Clinical", "ACTCA"]),
  c("quest-farmington-hills", "QUEST Research Institute", "Farmington Hills, MI", 42.4853, -83.3772, null, null, ["Quest Research"]),
  c("k2-maitland", "K2 Medical Research", "Maitland, FL", 28.6278, -81.3631, null, null, ["K2"], ["Maitland", "Orlando"]),
  // Its other place, at Lady Lake and The Villages, is left out: it is sixty miles off.
  c("charter-orlando", "Charter Research", "Orlando, FL", 28.5383, -81.3792, null, null, ["Charter Research"], ["Orlando", "Winter Park"]),
  // Not "Rocky Mountain" alone: cancer, movement-disorder and ear centres in Englewood begin that way.
  c("cenexel-englewood", "CenExel RMCR", "Englewood, CO", 39.6478, -104.9878, "https://cenexelclinicaltrials.com/search-result-new/", null, ["CenExel", "CenExcel", "Rocky Mountain Clinical Research"]),
];

/** A Clinic's distinct name for a sentence: "Fortrea, Madison, WI". */
export const clinicLabel = (clinic: Clinic) => `${clinic.name}, ${clinic.place}`;

const byId = new Map(CLINICS.map((clinic) => [clinic.id, clinic]));
export const clinicById = (id: string): Clinic | undefined => byId.get(id);

/** How many Clinics one Watch may name: each adds to the question put to ClinicalTrials.gov. */
export const MAX_WATCH_CLINICS = 10;

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole words only, so "ICON" does not find "Silicon"; upper and lower case are the same. */
const namesIt = (facility: string, name: string) => new RegExp(`(^|[^a-z0-9])${escaped(name)}($|[^a-z0-9])`, "i").test(facility);

/** The Clinics a Trial's sites name, given each site's name and city as its listing has them. */
export function clinicsNamedBy(sites: { facility?: string; city?: string }[]): string[] {
  return CLINICS.filter((clinic) =>
    sites.some((site) => !!site.facility && !!site.city && clinic.cities.some((city) => city.toLowerCase() === site.city!.toLowerCase()) && clinic.names.some((name) => namesIt(site.facility!, name))),
  ).map((clinic) => clinic.id);
}

/**
 * "Has a site that is one of these Clinics", as ClinicalTrials.gov's search understands it:
 * SEARCH[Location] makes the name and the city belong to the same site. Checked against the live
 * API on 2026-11-22: Celerion in Lincoln finds 177 healthy-volunteer Trials, Celerion in Tempe
 * 194, and the two joined with OR 354 (17 Trials run at both). Unknown ids are left out.
 */
export function clinicsFilter(ids: string[]): string | null {
  const parts = ids
    .map(clinicById)
    .filter((clinic): clinic is Clinic => !!clinic)
    .map((clinic) => `SEARCH[Location](AREA[LocationFacility](${clinic.names.map((n) => `"${n}"`).join(" OR ")}) AND AREA[LocationCity](${clinic.cities.map((n) => `"${n}"`).join(" OR ")}))`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : `(${parts.join(" OR ")})`;
}
