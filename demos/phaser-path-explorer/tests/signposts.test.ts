import { describe, expect, it } from "vitest";
import { groupSignposts, sideOfAxial } from "../src/game/signposts.js";

describe("signposts", () => {
  it("point to the nearest of the six hex directions", () => {
    expect(sideOfAxial(3, 0)).toBe("e");
    expect(sideOfAxial(-3, 0)).toBe("w");
    expect(sideOfAxial(0, 3)).toBe("se"); // down and to the right on a pointy-top grid
    expect(sideOfAxial(-3, 3)).toBe("sw");
    expect(sideOfAxial(0, -3)).toBe("nw");
    expect(sideOfAxial(3, -3)).toBe("ne");
  });

  it("are imprecise: two settlements the same way share one arrow", () => {
    const grouped = groupSignposts([
      { at: "camp", dq: 5, dr: 0 },
      { at: "camp", dq: 9, dr: 1 },
      { at: "camp", dq: -4, dr: 0 },
    ]);
    expect(grouped.get("camp")).toEqual(["e", "w"]);
  });
});
