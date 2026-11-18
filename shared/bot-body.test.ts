import { describe, expect, it } from "vitest";

import { BOT_BODY_IDS, FESTIVAL_IDS, FESTIVALS, bodyForBot, botBodyId, botBodyOf, botBodySchema, isCarvedBody, isFestival } from "./bot-body.ts";
import { CARVED_BODY_IDS } from "./carved-bodies.ts";
import { MASCOT_BODY_IDS } from "./mascot-bodies.ts";
import { MAUS_COLOR_NAMES } from "./wire.ts";

describe("bot bodies", () => {
  it("accepts every gradient body and every festival body", () => {
    expect(BOT_BODY_IDS).toEqual([...MASCOT_BODY_IDS, ...CARVED_BODY_IDS]);
    for (const id of BOT_BODY_IDS) expect(botBodySchema.safeParse(id).success).toBe(true);
  });

  it("falls back to the iris for anything it does not know", () => {
    expect(botBodyId("pumpkin")).toBe("pumpkin");
    expect(botBodyId("laddu")).toBe("laddu");
    expect(botBodyId("spark")).toBe("spark");
    expect(botBodyId("hexagram")).toBe("iris");
    expect(botBodyId(undefined)).toBe("iris");
  });

  it("tells the festival bodies apart", () => {
    expect(isCarvedBody("ghost")).toBe(true);
    expect(isCarvedBody("jalebi")).toBe(true);
    expect(isCarvedBody("iris")).toBe(false);
    expect(isCarvedBody(null)).toBe(false);
  });

  it("splits the festival bodies between the festivals, one pack each", () => {
    expect(FESTIVAL_IDS).toEqual(["halloween", "diwali"]);
    expect(FESTIVAL_IDS.flatMap((festival) => FESTIVALS[festival].bodies)).toEqual([...CARVED_BODY_IDS]);
    expect(isFestival("diwali")).toBe(true);
    expect(isFestival("midnight")).toBe(false);
    expect(isFestival("toString")).toBe(false);
  });

  it.each(FESTIVAL_IDS)("gives every bot colour but silver and chrome its own %s costume from that festival", (festival) => {
    const { bodies, costumes } = FESTIVALS[festival];
    const dressed = MAUS_COLOR_NAMES.filter((color) => color !== "silver" && color !== "chrome");
    expect(Object.keys(costumes).sort()).toEqual([...dressed].sort());
    expect(new Set(Object.values(costumes)).size).toBe(dressed.length);
    for (const body of Object.values(costumes)) expect(bodies).toContain(body);
  });
});

describe("a bot's own body", () => {
  const ids = Array.from({ length: 40 }, (_, i) => `bot-${i}-${(i * 7919).toString(36)}`);

  it("is the iris for the default bot and for a bot with no id", () => {
    expect(bodyForBot({ id: "anything", defaultBot: { person: "" } })).toBe("iris");
    expect(bodyForBot({})).toBe("iris");
  });

  it("is dealt from the bot's id: stable, never the default's iris, and varied across bots", () => {
    for (const id of ids) {
      expect(bodyForBot({ id })).toBe(bodyForBot({ id }));
      expect(bodyForBot({ id })).not.toBe("iris");
      expect(MASCOT_BODY_IDS).toContain(bodyForBot({ id }));
    }
    expect(new Set(ids.map((id) => bodyForBot({ id }))).size).toBeGreaterThanOrEqual(5);
  });

  it("keeps a body the bot picked, and deals one for an unknown or missing pick", () => {
    expect(botBodyOf({ id: "a", mascotBody: "pumpkin" })).toBe("pumpkin");
    expect(botBodyOf({ id: "a", mascotBody: "iris" })).toBe("iris");
    expect(botBodyOf({ id: "a", mascotBody: "cursor" })).toBe(bodyForBot({ id: "a" }));
    expect(botBodyOf({ id: "a" })).toBe(bodyForBot({ id: "a" }));
  });
});
