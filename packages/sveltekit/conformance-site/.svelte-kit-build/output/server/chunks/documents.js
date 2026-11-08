// src/lib/documents.ts
function sized(pages) {
	const nodes = Array.from({ length: pages }, (_, i) => ({
		id: `p${i}`,
		labels: ["Page"],
		properties: {
			slug: `/p/${i}`,
			title: `Page ${i}`,
			section: `s${i % 20}`
		}
	}));
	const links = [];
	for (let i = 0; i < pages; i++) for (let j = 1; j <= 5; j++) links.push({
		source: `p${i}`,
		target: `p${(i * 7 + j * 13) % pages}`,
		type: "LINKS_TO"
	});
	return {
		version: 1,
		nodes,
		links
	};
}
/** A small graph for the lifetime and inline pages. */
function small() {
	return {
		version: 1,
		nodes: Array.from({ length: 20 }, (_, i) => ({
			id: `n${i}`,
			labels: ["Item"],
			properties: { n: i }
		})),
		links: Array.from({ length: 19 }, (_, i) => ({
			source: `n${i}`,
			target: `n${i + 1}`,
			type: "NEXT"
		}))
	};
}
export { small as n, sized as t };

//# sourceMappingURL=documents.js.map