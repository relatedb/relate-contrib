import { l as escape_html, n as ensure_array_like, s as attr } from "./server2.js";
import { r as mountedConfig, t as getConfig } from "./context.js";
import { ft as resolve } from "./internal.js";
import { createClient, createSiteClient } from "@relate/web";
// ../src/inline.js
/**
* @param {Element} el
* @returns {boolean}
*/
var visible = (el) => {
	const parent = el.parentElement;
	if (!parent) return false;
	return typeof parent.checkVisibility === "function" ? parent.checkVisibility() : true;
};
/**
* @param {string} id
* @param {ParentNode} [root]
* @returns {{ element: Element, document: unknown, indexes: Array<{ label: string, property: string }> } | null}
*/
function findInline(id, root = document) {
	const matches = Array.from(root.querySelectorAll("script[type=\"application/json\"][data-relate-graph]")).filter((el) => el.getAttribute("data-relate-graph") === id);
	const element = matches.length === 1 ? matches[0] : matches.find(visible);
	if (!element) return null;
	const payload = JSON.parse(element.textContent ?? "{}");
	return {
		element,
		document: payload.document,
		indexes: payload.config?.indexes ?? []
	};
}
// ../src/locations.js
/**
* @param {string} id
* @returns {string}
*/
var descriptorLocation = (id) => resolve(`/relate/${id}/descriptor.json`);
// ../src/registry.js
/**
* @typedef {import("@relate/web").Client} Client
* @typedef {import("./context.js").Config} Config
* @typedef {{ navigation?: "client-routing" | "multi-page", descriptor?: string }} GraphOptions
* @typedef {{ client: Client, release(): void }} Held
*/
var OWNER = "@relate/sveltekit";
/** @param {Config} config */
var registeredList = (config) => config.catalog.length ? config.catalog.map((g) => g.id).join(", ") : "(none)";
/** Visit-lifetime clients, one per profile, id and descriptor. Navigation never destroys them. @type {Map<string, Client>} */
var visitClients = /* @__PURE__ */ new Map();
/**
* @param {Config} config
* @param {string} id
* @param {string} descriptor
* @param {"client-routing" | "multi-page"} profile
* @returns {Client}
*/
function visitClient(config, id, descriptor, profile) {
	const key = `${profile}\n${id}\n${descriptor}`;
	let client = visitClients.get(key);
	if (!client) {
		client = profile === "multi-page" ? createSiteClient({
			engineUrl: config.engineUrl,
			graph: { descriptor },
			navigation: profile
		}) : createClient({
			engineUrl: config.engineUrl,
			graph: { descriptor },
			navigation: profile
		});
		visitClients.set(key, client);
	}
	return client;
}
/**
* A visit-lifetime registered graph, for code that lives across pages (spec FR-023).
* @param {Config | null} config
* @param {string} id
* @param {GraphOptions} [options]
* @returns {Client}
*/
function visitGraph(config, id, options = {}) {
	if (!config) throw new Error(`${OWNER}: graph("${id}") was called before RelateProvider mounted; ask after it has mounted, or from a component with useGraph`);
	const entry = config.catalog.find((g) => g.id === id);
	if (!entry) {
		if (findInline(id)) throw new Error(`${OWNER}: "${id}" is an inline graph of a page; ask for it from a component with useGraph`);
		throw new Error(`${OWNER}: no registered graph with the id "${id}" (registered: ${registeredList(config)})`);
	}
	if (entry.lifetime !== "visit") throw new Error(`${OWNER}: "${id}" has the "page" lifetime; ask for it from a component with useGraph, or register it with lifetime "visit"`);
	return visitClient(config, id, options.descriptor ?? descriptorLocation(id), options.navigation ?? config.profile);
}
// ../src/use-graph.svelte.js
function useGraph(id, options) {
	const config = getConfig();
	const name = typeof id === "function" ? "(reactive id)" : id;
	if (!config) throw new Error(`@relate/sveltekit: useGraph("${name}") was used outside RelateProvider`);
	/** @type {Client | null} */
	let client = null;
	return { get client() {
		return client;
	} };
}
var IDLE = {
	status: "idle",
	rows: null,
	error: null,
	generation: 0
};
/**
* @param {Reactive<string>} id
* @param {Reactive<string>} statement
* @param {Reactive<object | null | undefined>} [params]
* @param {GraphOptions} [options]
* @returns {{ readonly status: import("@relate/web").Status | "idle", readonly rows: Array<Record<string, unknown>> | null, readonly error: string | null, readonly generation: number }}
*/
function useQuery(id, statement, params, options) {
	useGraph(id, options);
	let result = IDLE;
	return {
		get status() {
			return result.status;
		},
		get rows() {
			return result.rows;
		},
		get error() {
			return result.error;
		},
		get generation() {
			return result.generation;
		}
	};
}
/**
* The client of a visit-lifetime registered graph, for code that lives across pages. Throws for a page-lifetime or inline graph and for an unknown id.
* @param {string} id
* @param {GraphOptions} [options]
* @returns {Client}
*/
function graph(id, options) {
	return visitGraph(mountedConfig(), id, options);
}
// src/lib/Nav.svelte
function Nav($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const pages = [
			["Home", "/"],
			["Page 1", "/page-1.html"],
			["Page 2", "/page-2.html"],
			["Notes", "/notes.html"],
			["Broken", "/broken.html"],
			["Inline A", "/inline-a.html"],
			["Inline B", "/inline-b.html"],
			["Two graphs", "/two-graphs.html"],
			["Lifetime A", "/lifetime-a.html"],
			["Lifetime B", "/lifetime-b.html"],
			["Lifetime C", "/lifetime-c.html"],
			["Direct", "/direct.html"],
			["Live", "/live.html"]
		];
		$$renderer.push(`<nav><!--[-->`);
		const each_array = ensure_array_like(pages);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let [label, path] = each_array[$$index];
			$$renderer.push(`<a data-rel-link=""${attr("href", resolve(path))}>${escape_html(label)}</a>`);
		}
		$$renderer.push(`<!--]--></nav>`);
	});
}
// src/lib/RelPage.svelte
Math.random().toString(36).slice(2, 8);
function RelPage($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { title, graph = "example", label = "Page", notesPage = false, variant: pageVariant, bare = false, children } = $$props;
		const descriptors = {
			a: void 0,
			b: "/descriptor-b.json",
			mismatch: "/descriptor-mismatch.json",
			broken: "/descriptor-broken.json"
		};
		const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
		const navigation = params.get("navigation") ?? void 0;
		const variant = params.get("variant") ?? pageVariant ?? "a";
		bare || useGraph(graph, {
			navigation,
			descriptor: graph === "example" ? descriptors[variant] : void 0
		});
		const profile = navigation ?? "multi-page";
		`${"(".repeat(1e3)}${")".repeat(1e3)}`;
		let state = {
			status: "loading",
			generation: 0,
			count: "…",
			updates: 0,
			notes: "…",
			failure: "",
			lastError: "",
			restored: "unknown",
			instance: ""
		};
		$$renderer.push(`<main><h1 data-rel-title="">${escape_html(title)}</h1> `);
		Nav($$renderer, {});
		$$renderer.push(`<!----> `);
		children?.($$renderer);
		$$renderer.push(`<!----> `);
		if (!bare) $$renderer.push(`<!--[0--><section><p>Status: <span data-rel-status="">${escape_html(state.status)}</span> · generation <span data-rel-generation="">${escape_html(state.generation)}</span> · profile <span data-rel-profile="">${escape_html(profile === "client-routing" ? "persistent" : "per-page")}</span> · instance <span data-rel-instance="">${escape_html(state.instance)}</span> · restored <span data-rel-restored="">${escape_html(state.restored)}</span></p> <p>Pages in the graph: <span data-rel-count="">${escape_html(state.count)}</span> · updates <span data-rel-updates="">${escape_html(state.updates)}</span> · last error <span data-rel-last-error="">${escape_html(state.lastError)}</span></p> <p data-rel-failure="">${escape_html(state.failure)}</p> <p data-rel-notes-row=""${attr("hidden", !notesPage)}>Notes: <span data-rel-notes="">${escape_html(state.notes)}</span></p> <p><button type="button" data-rel-action="trap">Run a statement that crashes the engine</button> <button type="button" data-rel-action="timeout">Run a statement that never ends (0.4 s timeout)</button></p></section>`);
		else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></main>`);
	});
}
export { useQuery as i, graph as n, useGraph as r, RelPage as t };

//# sourceMappingURL=RelPage.js.map