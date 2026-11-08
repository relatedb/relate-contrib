const nodes = Array.from({length: 20}, (_, i) => ({id: `n${i}`, labels: ["Item"], properties: {n: i}}));
const links = Array.from({length: 19}, (_, i) => ({source: `n${i}`, target: `n${i + 1}`, type: "NEXT"}));
process.stdout.write(JSON.stringify({version: 1, nodes, links}));
