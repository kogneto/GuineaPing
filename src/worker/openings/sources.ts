import { altasciencesKc } from "./altasciencesKc";
import { altasciencesLa } from "./altasciencesLa";
import { celerion } from "./celerion";
import { fortrea } from "./fortrea";
import type { Source } from "./types";

/** Every Clinic site GuineaPing reads. A Clinic not listed here is never visited. */
export const SOURCES: Source[] = [fortrea, celerion, altasciencesKc, altasciencesLa];
