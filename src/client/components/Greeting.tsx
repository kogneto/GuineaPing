import type { ReactNode } from "react";
import { Illustration, type ArtName } from "./Illustration";

/**
 * The card at the head of a page: the page's heading as the one thing worth knowing right now,
 * with a guinea pig beside it. The picture is decoration; the words carry the meaning.
 */
export function Greeting({ title, sub, art }: { title: ReactNode; sub?: ReactNode; art: ArtName }) {
  return (
    <section className="greeting">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <Illustration name={art} size="hero" />
    </section>
  );
}
