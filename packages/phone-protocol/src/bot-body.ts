/** Every body a bot can wear: the gradient catalog plus the festival bodies. */

import { z } from "zod";

import { DEFAULT_MASCOT_BODY, MASCOT_BODY_IDS, type MascotBodyId } from "./mascot-bodies.ts";
import { CARVED_BODY_IDS, DIWALI_BODY_IDS, HALLOWEEN_BODY_IDS, type CarvedBodyId } from "./carved-bodies.ts";
import type { MausColor } from "./wire.ts";

export const BOT_BODY_IDS = [...MASCOT_BODY_IDS, ...CARVED_BODY_IDS] as const;

export type BotBodyId = (typeof BOT_BODY_IDS)[number];

export const botBodySchema = z.enum(BOT_BODY_IDS);

/** Runtime-safe read of an untrusted persisted or streamed body id. */
export function botBodyId(value: unknown): BotBodyId {
  return botBodySchema.safeParse(value).data ?? DEFAULT_MASCOT_BODY;
}

/** The bodies a bot is dealt from when it never picked one; the default bot keeps the iris to itself. */
const DEALT_BODIES = MASCOT_BODY_IDS.filter((id) => id !== DEFAULT_MASCOT_BODY);

/**
 * The body a bot wears when it never picked one: the default bot wears the iris, matching the
 * app icon, and every other bot a body chosen from its id, so it is the same on every launch and
 * device and different bots look different.
 */
export function bodyForBot(bot: { id?: string | null; defaultBot?: unknown }): MascotBodyId {
  if (!bot.id || bot.defaultBot) return DEFAULT_MASCOT_BODY;
  let hash = 0x811c9dc5;
  for (let i = 0; i < bot.id.length; i++) hash = Math.imul(hash ^ bot.id.charCodeAt(i), 0x01000193);
  return DEALT_BODIES[(hash >>> 0) % DEALT_BODIES.length]!;
}

/** The body a bot wears: the one it picked when that is still a body, else its own dealt one. */
export function botBodyOf(bot: { id?: string | null; defaultBot?: unknown; mascotBody?: unknown }): BotBodyId {
  const picked = botBodySchema.safeParse(bot.mascotBody);
  return picked.success ? picked.data : bodyForBot(bot);
}

export function isCarvedBody(value: unknown): value is CarvedBodyId {
  return (CARVED_BODY_IDS as readonly unknown[]).includes(value);
}

export type CostumeColor = Exclude<MausColor, "silver" | "chrome">;

/** A festival skin's own bodies, and the costume each bot colour wears while "Dress my bots up" is on with it. */
const festival = <Id extends CarvedBodyId>(bodies: readonly Id[], costumes: Record<CostumeColor, NoInfer<Id>>) => ({ bodies, costumes });

/** Keyed by the skin id that turns each festival on. */
export const FESTIVALS = {
  halloween: festival(HALLOWEEN_BODY_IDS, {
    orange: "pumpkin",
    purple: "ghost",
    teal: "witch",
    red: "bat",
    blue: "cat",
    cyan: "skull",
    green: "monster",
    yellow: "mummy",
    coral: "vampire",
    pink: "spider",
  }),
  diwali: festival(DIWALI_BODY_IDS, {
    orange: "laddu",
    purple: "chakri",
    teal: "karanji",
    red: "rocket",
    blue: "bomb",
    cyan: "chakli",
    green: "anaar",
    yellow: "katli",
    coral: "jalebi",
    pink: "sparkler",
  }),
};

export type FestivalId = keyof typeof FESTIVALS;

export const FESTIVAL_IDS = Object.keys(FESTIVALS) as FestivalId[];

export function isFestival(value: unknown): value is FestivalId {
  return typeof value === "string" && Object.hasOwn(FESTIVALS, value);
}
