import { describe, expect, it } from "vitest";
import { bubbleRows, readerText } from "../src/bubbles.js";

const scores = { last: 450, best: 500 };

describe("splash bubbles", () => {
  it("puts the premise on top, every key in the middle, and the prompt and scores at the bottom", () => {
    const rows = bubbleRows({ scores, canContinue: true });
    expect(rows.top.map((m) => m.text).join(" ")).toMatch(/seventh night.*spare settlements/);
    expect(rows.middle.map((m) => m.key)).toEqual(["← →", "↑", "↓", "Shift + ↑ ↓", "P", "E", "Backspace, ⌘Z", "Esc, H, ?"]);
    expect(rows.bottom[0]!.text).toBe("Press any key to continue.");
    expect(rows.bottom.map((m) => m.text).join(" ")).toMatch(/Last game: 450\. Best: 500\..*perfect game scores 600/);
  });

  it("offers a new game as the way to start when there is no game to continue", () => {
    const over = bubbleRows({ scores: { last: null, best: null }, canContinue: false });
    expect(over.bottom[0]!.text).toBe("Press any key to start a new game.");
    expect(over.bottom.some((m) => m.key === "N")).toBe(false);
    expect(over.bottom.map((m) => m.text).join(" ")).toContain("none yet");
  });

  it("reads out everything for a screen reader, the result first", () => {
    const text = readerText(bubbleRows({ scores, canContinue: true }), 320);
    expect(text.split("\n")[0]).toBe("The game is over. You scored 320.");
    expect(text).toContain("P: Place a waymarker here and secure the path");
  });
});
