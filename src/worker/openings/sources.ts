import { abbvie } from "./abbvie";
import { altasciencesKc } from "./altasciencesKc";
import { altasciencesLa } from "./altasciencesLa";
import { axis } from "./axis";
import { celerion } from "./celerion";
import { cenexel } from "./cenexel";
import { cpmi } from "./cpmi";
import { drVince } from "./drVince";
import { fortrea } from "./fortrea";
import { novum } from "./novum";
import { ocrc } from "./ocrc";
import { pfizer } from "./pfizer";
import { pharmaron } from "./pharmaron";
import { prosciento } from "./prosciento";
import { syneos } from "./syneos";
import { tkl } from "./tkl";
import type { Source } from "./types";

/** Every Clinic site GuineaPing reads. A Clinic not listed here is never visited. */
export const SOURCES: Source[] = [fortrea, celerion, altasciencesKc, altasciencesLa, pharmaron, ocrc, pfizer, novum, tkl, drVince, syneos, axis, cenexel, prosciento, abbvie, cpmi];
