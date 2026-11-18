import { MAUS_COLOR_NAMES, type MausColor } from "../shared/wire.ts";

export const STARTER_COLORS: readonly MausColor[] = MAUS_COLOR_NAMES.filter((color) => color !== "silver" && color !== "chrome");
const ROTATION: readonly MausColor[] = ["green", "blue", "red", "orange", "purple", "cyan", "pink", "yellow", "teal", "coral"];

/** The colour of the bot made `index`-th when nothing else picks one. */
export const rotationColor = (index: number): MausColor => ROTATION[index % ROTATION.length]!;

/** A new bot's first look: a random colour no bot here wears yet when one is left. Its body is left unset, so it
 * wears the character its id deals it (shared/bot-body.ts bodyForBot). */
export function freshLook(
  bots: ReadonlyArray<{ color: MausColor }>,
  random: () => number = Math.random,
): { color: MausColor } {
  const unworn = STARTER_COLORS.filter((color) => !bots.some((bot) => bot.color === color));
  const pool = unworn.length ? unworn : STARTER_COLORS;
  return { color: pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]! };
}
