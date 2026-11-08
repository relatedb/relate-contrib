import { l as escape_html, n as ensure_array_like, s as attr } from "./server2.js";
import { r as mountedConfig, t as getConfig } from "./context.js";
import { t as validateDescriptor } from "./descriptor.js";
import { yt as resolve } from "./internal.js";
// ../../web/dist/errors.js
/** Why a call to the client did not produce a result. Engine errors are not GraphErrors: they arrive in the envelope. */
var GraphError = class extends Error {
	reason;
	engineError;
	constructor(reason, message, engineError) {
		super(message ?? reason);
		this.name = "GraphError";
		this.reason = reason;
		this.engineError = engineError;
	}
};
// ../../web/dist/worker/encode.js
function floatText(n) {
	const s = Object.is(n, -0) ? "-0" : String(n);
	return /[eE.]/.test(s) ? s : `${s}.0`;
}
function numberText(n) {
	if (!Number.isFinite(n)) throw new Error("cannot encode a number that is not finite");
	return String(n);
}
function encodeParams(value) {
	if (value === null) return "null";
	switch (typeof value) {
		case "string": return JSON.stringify(value);
		case "boolean": return value ? "true" : "false";
		case "number": return numberText(value);
		case "object": break;
		default: throw new Error(`cannot encode a value of type ${typeof value}`);
	}
	if (Array.isArray(value)) {
		if (value.length > 0 && value.every((v) => typeof v === "number") && value.some((v) => !Number.isInteger(v))) return `[${value.map((v) => (numberText(v), floatText(v))).join(",")}]`;
		return `[${value.map(encodeParams).join(",")}]`;
	}
	const parts = [];
	for (const [key, v] of Object.entries(value)) {
		if (v === void 0) continue;
		parts.push(`${JSON.stringify(key)}:${encodeParams(v)}`);
	}
	return `{${parts.join(",")}}`;
}
// ../../web/dist/client/diagnostic.js
function diagnosticMessage(diagnostic, issueUrl) {
	if (!diagnostic) return "";
	if (diagnostic.reason === "unsupported") return `This browser cannot run the graph (${diagnostic.engineError ?? "unsupported"}).`;
	const lines = [`The graph could not be loaded after ${diagnostic.failures === 1 ? "1 attempt" : `${diagnostic.failures} attempts`} (${diagnostic.reason}).`];
	if (diagnostic.engineError) lines.push(`Details: ${diagnostic.engineError}`);
	lines.push(issueUrl ? `Please report this as an issue at ${issueUrl} and include the details above.` : "Please report this as an issue and include the details above.");
	return lines.join("\n");
}
// ../../web/dist/client/events.js
var Emitter = class {
	listeners = /* @__PURE__ */ new Map();
	on(event, listener) {
		let set = this.listeners.get(event);
		if (!set) this.listeners.set(event, set = /* @__PURE__ */ new Set());
		set.add(listener);
		return () => {
			set.delete(listener);
		};
	}
	has(event) {
		return (this.listeners.get(event)?.size ?? 0) > 0;
	}
	/** The payload is built only when someone is listening, and once however many listeners there are. */
	emit(event, payload) {
		const set = this.listeners.get(event);
		if (!set || set.size === 0) return;
		const built = payload();
		for (const listener of [...set]) try {
			listener(built);
		} catch {}
	}
};
// ../../web/dist/client/failure.js
var FailureCounter = class {
	limit;
	count = 0;
	constructor(limit = 3) {
		this.limit = limit;
	}
	get failures() {
		return this.count;
	}
	/** An attempt ended without reaching `ready`. No worker support gives up at once, counting nothing. */
	attemptFailed(reason) {
		if (reason === "unsupported") return "give-up";
		this.count++;
		return this.count >= this.limit ? "give-up" : "retry";
	}
	ready() {
		this.count = 0;
	}
	reset() {
		this.count = 0;
	}
};
// ../../web/dist/client/status.js
var StatusMachine = class {
	onChange;
	current = "loading";
	count = 0;
	constructor(onChange) {
		this.onChange = onChange;
	}
	get status() {
		return this.current;
	}
	get generation() {
		return this.count;
	}
	markReady() {
		this.count++;
		this.set("ready");
	}
	markRecovering() {
		this.set("recovering");
	}
	markFailed() {
		this.set("failed");
	}
	markLoading() {
		this.set("loading");
	}
	set(next) {
		if (next === this.current) return;
		this.current = next;
		this.onChange?.(next, this.count);
	}
};
// ../../web/dist/client/subscriptions.js
var Registry = class {
	subscriptions = /* @__PURE__ */ new Set();
	generationListeners = /* @__PURE__ */ new Set();
	/** The newest generation seen; results from an older one are dropped. */
	latest = 0;
	/**
	* Register a query. When the instance is ready it runs at once; otherwise the listener is told the current
	* status (so a component can show its placeholder) and the query runs when the instance is ready.
	*/
	subscribe(statement, params, listener, current, run) {
		const subscription = {
			statement,
			params,
			listener,
			active: true
		};
		this.subscriptions.add(subscription);
		if (current.status === "ready") {
			this.latest = Math.max(this.latest, current.generation);
			this.runOne(subscription, current.generation, run);
		} else listener({
			status: current.status,
			generation: current.generation,
			rows: null,
			error: null
		});
		return () => {
			subscription.active = false;
			this.subscriptions.delete(subscription);
		};
	}
	/** Register a listener for new instances. It runs before subscriptions re-run, and may be asynchronous. */
	onGeneration(listener) {
		this.generationListeners.add(listener);
		return () => void this.generationListeners.delete(listener);
	}
	/** A new instance is ready: run the generation listeners in order, then re-run every subscription. */
	async ready(generation, run) {
		this.latest = generation;
		for (const listener of [...this.generationListeners]) try {
			await listener(generation);
		} catch {}
		await Promise.all([...this.subscriptions].map((s) => this.runOne(s, generation, run)));
	}
	/** Tell every subscriber about a status that is not `ready`; their rows are cleared. */
	notify(status, generation) {
		for (const s of [...this.subscriptions]) s.listener({
			status,
			generation,
			rows: null,
			error: null
		});
	}
	async runOne(subscription, generation, run) {
		let envelope;
		try {
			envelope = await run(subscription.statement, subscription.params);
		} catch {
			return;
		}
		if (!subscription.active || generation !== this.latest) return;
		subscription.listener(envelope.error ? {
			status: "ready",
			generation,
			rows: null,
			error: envelope.error
		} : {
			status: "ready",
			generation,
			rows: envelope.rows,
			error: null
		});
	}
};
// ../../web/dist/client/client.js
/** A start-up problem found on the page before the worker was asked to do anything. */
var StartFailure = class extends Error {
	reason;
	constructor(reason, message) {
		super(message);
		this.reason = reason;
	}
};
var defaultWorker = () => new Worker(new URL("../worker/worker.js", import.meta.url), { type: "module" });
var absolute = (url, base) => new URL(String(url), base).href;
function createClient(options) {
	return new GraphClient(options);
}
var GraphClient = class {
	options;
	diagnostic = null;
	machine;
	registry = new Registry();
	emitter = new Emitter();
	worker = null;
	pending = /* @__PURE__ */ new Map();
	nextId = 0;
	failures = new FailureCounter();
	/** Why the instance now starting replaces a ready one; reported when the replacement is ready. */
	replacing = null;
	scopes = /* @__PURE__ */ new Set();
	destroyed = false;
	waiters = [];
	constructor(options) {
		this.options = options;
		this.machine = new StatusMachine((status, generation) => this.onStatus(status, generation));
		this.start();
	}
	get status() {
		return this.machine.status;
	}
	get generation() {
		return this.machine.generation;
	}
	async query(statement, params = null, opts = {}) {
		await this.whenReady();
		return this.execute(statement, params, opts.timeoutMs);
	}
	/**
	* A statement typed by a visitor. It has a timeout (the visitor timeout when none is given) and a stop control;
	* both end by replacing the instance, since a running statement can only be ended by ending its worker.
	*/
	run(statement, params = null, opts = {}) {
		const timeoutMs = opts.timeoutMs ?? this.options.visitorTimeoutMs ?? 1e4;
		const call = {
			id: null,
			stopped: false
		};
		const paramsJson = params ? encodeParams(params) : null;
		return {
			result: this.whenReady().then(() => {
				if (call.stopped) throw new GraphError("stopped");
				const started = this.startRequest((id) => ({
					type: "query",
					id,
					statement,
					paramsJson
				}), timeoutMs);
				call.id = started.id;
				return started.promise;
			}),
			stop: () => {
				call.stopped = true;
				if (call.id === null) return;
				const entry = this.take(call.id);
				if (!entry) return;
				entry.reject(new GraphError("stopped"));
				this.fault("stopped");
			}
		};
	}
	subscribe(statement, params, listener) {
		return this.registry.subscribe(statement, params, listener, {
			status: this.status,
			generation: this.generation
		}, (s, p) => this.execute(s, p, void 0));
	}
	onGeneration(listener) {
		return this.registry.onGeneration(listener);
	}
	on(event, listener) {
		return this.emitter.on(event, listener);
	}
	async addScoped(document, scope) {
		await this.whenReady();
		this.scopes.add(scope);
		await this.request((id) => ({
			type: "scoped-add",
			id,
			scope,
			document
		}), void 0);
	}
	async dropScope(scope) {
		try {
			await this.whenReady();
			await this.request((id) => ({
				type: "scoped-drop",
				id,
				scope
			}), void 0);
		} finally {
			this.scopes.delete(scope);
		}
	}
	async dropAllScopes() {
		await Promise.all([...this.scopes].map((scope) => this.dropScope(scope).catch(() => void 0)));
	}
	retry() {
		if (this.status !== "failed" || this.destroyed) return;
		this.diagnostic = null;
		this.failures.reset();
		this.machine.markLoading();
		this.start();
	}
	failureMessage() {
		return diagnosticMessage(this.diagnostic, this.options.issueUrl);
	}
	destroy() {
		this.destroyed = true;
		this.terminateWorker();
		this.rejectPending(new GraphError("lost", "the client was destroyed"));
		this.rejectWaiters(new GraphError("lost", "the client was destroyed"));
	}
	async prepare() {
		const engineUrl = absolute(this.options.engineUrl, location.href);
		const graph = this.options.graph;
		if ("descriptor" in graph) {
			let value = graph.descriptor;
			let base = location.href;
			if (typeof value === "string") {
				base = absolute(value, location.href);
				const response = await fetch(base);
				if (!response.ok) throw new StartFailure("worker-error", `the descriptor could not be fetched: ${response.status}`);
				value = await response.json();
			}
			const checked = validateDescriptor(value);
			if (!checked.ok) throw new StartFailure("invalid-descriptor", `${checked.path}: ${checked.message}`);
			const descriptor = checked.descriptor;
			return {
				engineUrl,
				descriptor,
				dataUrl: absolute(descriptor.data.url, base),
				document: null,
				indexes: [],
				useStore: this.options.store ?? this.options.navigation === "multi-page"
			};
		}
		const indexes = graph.indexes ?? [];
		return typeof graph.document === "string" ? {
			engineUrl,
			descriptor: null,
			dataUrl: absolute(graph.document, location.href),
			document: null,
			indexes,
			useStore: false
		} : {
			engineUrl,
			descriptor: null,
			dataUrl: null,
			document: graph.document,
			indexes,
			useStore: false
		};
	}
	async start() {
		if (this.destroyed) return;
		const attempt = this.failures.failures + 1;
		try {
			const init = await this.prepare();
			if (this.destroyed) return;
			const worker = this.options.workerFactory ? this.options.workerFactory() : defaultWorker();
			this.worker = worker;
			worker.onmessage = (e) => {
				if (worker === this.worker) this.onMessage(e.data);
			};
			worker.onerror = (e) => {
				if (worker !== this.worker) return;
				const message = e.message || "the worker failed";
				if (this.status === "ready") this.fault("worker-error");
				else this.attemptFailed("worker-error", message);
			};
			worker.postMessage({
				type: "init",
				...init,
				attempt
			});
		} catch (e) {
			if (e instanceof StartFailure) this.attemptFailed(e.reason, e.message);
			else this.attemptFailed("worker-error", e instanceof Error ? e.message : String(e));
		}
	}
	onMessage(msg) {
		switch (msg.type) {
			case "ready":
				this.onReady(msg.restored, msg.timings);
				break;
			case "init-failed":
				this.attemptFailed(msg.reason, msg.message);
				break;
			case "result":
				this.take(msg.id)?.resolve(JSON.parse(msg.envelopeText));
				break;
			case "done":
				this.take(msg.id)?.resolve({
					columns: [],
					rows: [],
					error: null
				});
				break;
			case "error": if (msg.reason === "trap") {
				this.take(msg.id)?.reject(new GraphError("trap", msg.message));
				this.fault("trap");
			} else this.take(msg.id)?.reject(new GraphError("invalid-document", msg.message));
		}
	}
	onReady(restored, timings) {
		this.failures.ready();
		this.diagnostic = null;
		this.machine.markReady();
		const generation = this.generation;
		if (this.replacing) {
			const reason = this.replacing;
			this.replacing = null;
			this.emitter.emit("replaced", () => ({
				reason,
				generation
			}));
		}
		for (const phase of [
			"init",
			"open",
			restored ? "restore" : "load",
			"total"
		]) {
			const ms = timings[phase];
			if (ms !== void 0) this.emitter.emit("timing", () => ({
				phase,
				ms,
				restored
			}));
		}
		this.resolveWaiters();
		this.registry.ready(generation, (s, p) => this.execute(s, p, void 0));
	}
	/** The instance that was ready is no longer usable: replace it. Calls in flight are lost. */
	fault(reason) {
		if (this.destroyed || this.status !== "ready") return;
		this.replacing = reason;
		this.terminateWorker();
		this.rejectPending(new GraphError("lost", "the instance was replaced"));
		this.machine.markRecovering();
		this.start();
	}
	/** An attempt to start an instance ended without reaching `ready`: try again, or stop at the limit. */
	attemptFailed(reason, message) {
		this.terminateWorker();
		if (this.failures.attemptFailed(reason) === "retry") {
			this.machine.markRecovering();
			this.start();
			return;
		}
		this.replacing = null;
		this.diagnostic = {
			reason,
			failures: this.failures.failures,
			engineError: message
		};
		this.rejectPending(new GraphError("lost", "the instance failed"));
		this.machine.markFailed();
		this.rejectWaiters(new GraphError("failed", message));
	}
	whenReady() {
		if (this.status === "ready") return Promise.resolve();
		if (this.status === "failed") return Promise.reject(new GraphError("failed", this.diagnostic?.engineError ?? "the graph failed to load"));
		return new Promise((resolve, reject) => this.waiters.push({
			resolve,
			reject
		}));
	}
	execute(statement, params, timeoutMs) {
		const paramsJson = params ? encodeParams(params) : null;
		return this.request((id) => ({
			type: "query",
			id,
			statement,
			paramsJson
		}), timeoutMs);
	}
	/** Send one message that is answered by a result or a done message, with an optional timeout. */
	request(build, timeoutMs) {
		return this.startRequest(build, timeoutMs).promise;
	}
	/** As `request`, also giving the call's id so that it can be stopped. */
	startRequest(build, timeoutMs) {
		const worker = this.worker;
		if (!worker || this.status !== "ready") return {
			id: null,
			promise: Promise.reject(new GraphError("lost", "the instance is not ready"))
		};
		const id = ++this.nextId;
		return {
			id,
			promise: new Promise((resolve, reject) => {
				const entry = {
					resolve,
					reject,
					timer: void 0
				};
				if (timeoutMs !== void 0) entry.timer = setTimeout(() => {
					this.take(id)?.reject(new GraphError("timeout"));
					this.fault("timeout");
				}, timeoutMs);
				this.pending.set(id, entry);
				worker.postMessage(build(id));
			})
		};
	}
	take(id) {
		const entry = this.pending.get(id);
		if (!entry) return void 0;
		this.pending.delete(id);
		if (entry.timer !== void 0) clearTimeout(entry.timer);
		return entry;
	}
	rejectPending(error) {
		for (const id of [...this.pending.keys()]) this.take(id)?.reject(error);
	}
	resolveWaiters() {
		const waiters = this.waiters;
		this.waiters = [];
		for (const w of waiters) w.resolve();
	}
	rejectWaiters(error) {
		const waiters = this.waiters;
		this.waiters = [];
		for (const w of waiters) w.reject(error);
	}
	terminateWorker() {
		const worker = this.worker;
		this.worker = null;
		worker?.terminate();
	}
	onStatus(status, generation) {
		this.emitter.emit("status", () => ({
			status,
			generation
		}));
		if (status !== "ready") this.registry.notify(status, generation);
	}
};
// ../../web/dist/profiles/per-page.js
function perPageClient(options) {
	const client = createClient({
		...options,
		navigation: "multi-page"
	});
	globalThis.addEventListener?.("pagehide", () => void client.dropAllScopes());
	return client;
}
// ../../web/dist/profiles/persistent.js
var visitClient$1 = null;
/** The visit's client; created on the first call, with that call's options. Later calls return it unchanged. */
function persistentClient(options) {
	return visitClient$1 ??= createClient({
		...options,
		navigation: "client-routing"
	});
}
// ../../web/dist/profiles/index.js
/** The client for this page under the configured profile; the configured `navigation` value decides. */
function createSiteClient(options) {
	return options.navigation === "client-routing" ? persistentClient(options) : perPageClient(options);
}
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