import { r as declare, t as graphs } from "../../chunks/graphs.js";
// ../dist/server/catalog.js
function catalog(graphs) {
	return declare(graphs).map(({ id, lifetime, indexes }) => ({
		id,
		lifetime,
		indexes
	}));
}
// src/routes/+layout.server.ts
var load = () => ({ catalog: catalog(graphs) });
export { load };

//# sourceMappingURL=_layout.server.ts.js.map