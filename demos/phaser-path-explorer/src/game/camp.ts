// The camp's tent, as the game draws it (ADR-011, amended 2026-11-19): the design system's tent shape in a cheerful yellow
// with a lit and a shaded side, so that it stands out from the red waymarker flags. The colours are added to the design
// system's palette here (a recorded deviation, for brand review), and the art replaces the design system's tent. This
// module has an effect when it is imported: the game imports it; the port's own checks do not.
import { paletteAsset } from "../hex/assets/index.js";
import { overrideFeatureArt } from "../hex/core/index.js";

export const CAMP_COLOURS: Record<string, string> = {
  "tent-light": "#FFE680",
  "tent-yellow": "#FFCF33",
  "tent-shade": "#E09A1A",
  "tent-door": "#7A4A12",
  "tent-pole": "#6B4423",
};

/** L is the lit side, Y the cloth, y the shaded side, d the door, p the pole and s the grass beneath. */
export const TENT = ["...pp...", "..LYYy..", ".LLYYYy.", "LLLYYYyy", "LLLdddyy", "ssssssss"];

Object.assign(paletteAsset.colours, CAMP_COLOURS);
overrideFeatureArt("tent", {
  rows: TENT,
  colours: { L: "tent-light", Y: "tent-yellow", y: "tent-shade", d: "tent-door", p: "tent-pole", s: "forest" },
  y: 6,
});
