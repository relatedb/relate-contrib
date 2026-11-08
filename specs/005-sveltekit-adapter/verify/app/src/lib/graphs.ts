let n = 0;
export const graphs = {
  example: { source: () => ({ version: 1, nodes: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { rev: process.env.REV ?? "1" } })), links: [] }) },
  ...(process.env.BAD === "throw" ? { bad: { source: () => { throw new Error("the pantry is empty"); } } } : {}),
  ...(process.env.BAD === "random" ? { bad: { source: () => ({ version: 1, nodes: [{ id: "a", properties: { n: n++ } }], links: [] }) } } : {}),
  ...(process.env.BAD === "invalid" ? { bad: { source: () => ({ version: 1, nodes: [{ labels: ["x"] }], links: [] }) } } : {}),
};
