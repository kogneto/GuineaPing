/**
 * The Clinics GuineaPing knows: research units that run paid studies for healthy volunteers and
 * advertise them on their own sites. Kept by hand, from docs/research/paid-study-sources.md.
 *
 * `source` names the reader that fetches this Clinic's study list once a day (src/worker/openings).
 * A Clinic without one is link-only: GuineaPing never visits its site, because its terms forbid
 * automated tools or it turns them away. The Member opens the link and reads it themselves.
 */
export type SourceId = "fortrea" | "celerion" | "altasciences-kc" | "altasciences-la" | "pharmaron" | "ocrc" | "pfizer" | "novum" | "tkl";

export type Clinic = {
  id: string;
  name: string;
  /** "City, ST" */
  place: string;
  lat: number;
  lon: number;
  /** The Clinic's own list of studies, for a Member to open. */
  url: string;
  source: SourceId | null;
};

const c = (id: string, name: string, place: string, lat: number, lon: number, url: string, source: SourceId | null = null): Clinic => ({ id, name, place, lat, lon, url, source });

const FORTREA = "https://www.fortreaclinicaltrials.com/en-us/clinical-research/browse-studies";
const CELERION = "https://helpresearch.com/studies";
const ICON = "https://iconstudies.com/All-Clinical-Research-Studies/";
const TRIALMED = "https://trialmed.com/find-a-study/";

export const CLINICS: Clinic[] = [
  // Read once a day.
  c("celerion-lincoln", "Celerion", "Lincoln, NE", 40.8, -96.667, CELERION, "celerion"),
  c("celerion-tempe", "Celerion", "Tempe, AZ", 33.4148, -111.9093, CELERION, "celerion"),
  c("fortrea-madison", "Fortrea", "Madison, WI", 43.0731, -89.4012, FORTREA, "fortrea"),
  c("fortrea-dallas", "Fortrea", "Dallas, TX", 32.7831, -96.8067, FORTREA, "fortrea"),
  c("fortrea-daytona", "Fortrea", "Daytona Beach, FL", 29.2108, -81.0228, FORTREA, "fortrea"),
  c("fortrea-san-antonio", "Fortrea", "San Antonio, TX", 29.4241, -98.4936, FORTREA, "fortrea"),
  c("altasciences-kc", "Altasciences", "Overland Park, KS", 38.9822, -94.6708, "https://participantskc.altasciences.com/available-studies", "altasciences-kc"),
  c("altasciences-la", "Altasciences", "Cypress, CA", 33.817, -118.0373, "https://participantsla.altasciences.com/current-studies", "altasciences-la"),
  c("ocrc", "Orlando Clinical Research Center", "Orlando, FL", 28.5383, -81.3792, "https://ocrc.net/current-studies/", "ocrc"),
  c("pharmaron", "Pharmaron", "Baltimore, MD", 39.2904, -76.6122, "https://www.pharmaron.com/services/clinical-development/clinical-trial-recruitment/clinical-trial-recruitment-us/", "pharmaron"),
  c("pfizer-new-haven", "Pfizer Clinical Research Unit", "New Haven, CT", 41.3081, -72.9282, "https://www.pfizerclinicaltrials.com/our-research/pcru-new-haven", "pfizer"),
  c("novum-las-vegas", "Novum", "Las Vegas, NV", 36.175, -115.1372, "https://www.gonovum.com/location/las-vegas/", "novum"),
  c("tkl-fair-lawn", "TKL Research", "Fair Lawn, NJ", 40.9404, -74.1318, "https://tklresearch.com/studies/", "tkl"),
  // Link only.
  c("icon-salt-lake-city", "ICON", "Salt Lake City, UT", 40.7608, -111.8911, ICON),
  c("icon-lenexa", "ICON", "Lenexa, KS", 38.9536, -94.7336, ICON),
  c("icon-san-antonio", "ICON", "San Antonio, TX", 29.4241, -98.4936, ICON),
  c("cenexel-anaheim", "CenExel ACT", "Anaheim, CA", 33.8353, -117.9145, "https://cenexelresearch.com/act/all-studies/"),
  c("cenexel-los-alamitos", "CenExel CNS", "Los Alamitos, CA", 33.8031, -118.0726, "https://cenexelresearch.com/cns/all-studies/"),
  c("cenexel-decatur", "CenExel iResearch", "Decatur, GA", 33.7748, -84.2963, "https://cenexelresearch.com/iresearch-atlanta/all-studies/"),
  c("cenexel-marlton", "CenExel HRI", "Marlton, NJ", 39.8912, -74.9218, "https://cenexelresearch.com/hri/all-studies/"),
  c("trialmed-austin", "Trialmed (PPD)", "Austin, TX", 30.2672, -97.7431, TRIALMED),
  c("trialmed-las-vegas", "Trialmed (PPD)", "Las Vegas, NV", 36.175, -115.1372, TRIALMED),
  c("medpace", "Medpace", "Cincinnati, OH", 39.1271, -84.5144, "https://www.medpace.com/study-participants/browse-studies/"),
  c("parexel-baltimore", "Parexel", "Baltimore, MD", 39.2904, -76.6122, "https://pxlcrs.my.site.com/portal/s/trials-listing-bal?loc=BAL&language=en_US"),
  c("parexel-glendale", "Parexel", "Glendale, CA", 34.1425, -118.2551, "https://www.parexel.com/trials/locations/los-angeles/about-us"),
  c("syneos-miami", "Syneos Health", "Miami, FL", 25.7743, -80.1937, "https://www.us-participants.syneoshealth.com/en/avalaible-studies/"),
  c("dr-vince", "Dr. Vince Clinical Research", "Overland Park, KS", 38.9822, -94.6708, "https://drvince.com/current-studies/"),
  c("qps-miami", "QPS", "South Miami, FL", 25.7076, -80.2934, "https://miamiresearch.com/"),
  c("quotient-miami", "Quotient Sciences", "Miami, FL", 25.7743, -80.1937, "https://www.weneedyoutrials.com/us/current-trials"),
  c("prosciento", "ProSciento", "Chula Vista, CA", 32.6401, -117.0842, "https://myproscientostudy.com/current-studies/"),
  c("nucleus-saint-paul", "Nucleus Network", "Saint Paul, MN", 44.9444, -93.0933, "https://www.nucleusnetwork.com/participants/find-a-trial/"),
  c("nih-clinical-center", "NIH Clinical Center", "Bethesda, MD", 38.9807, -77.1003, "https://www.cc.nih.gov/recruit/protocols"),
];

/** A Clinic's distinct name for a sentence: "Fortrea, Madison, WI". */
export const clinicLabel = (clinic: Clinic) => `${clinic.name}, ${clinic.place}`;
