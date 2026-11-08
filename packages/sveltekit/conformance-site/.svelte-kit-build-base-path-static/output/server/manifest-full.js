export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	app_dir: "_app",
	app_path: "docs/_app",
	assets: new Set(["descriptor-b.json","descriptor-broken.json","descriptor-mismatch.json","graph-a.json","graph-b.json"]),
	mime_types: {".json":"application/json"},
	client: {start:"_app/immutable/entry/start.GPNGhGQM.js",app:"_app/immutable/entry/app.CzdTHWmY.js",imports:["_app/immutable/entry/start.GPNGhGQM.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/DclECHGd.js","_app/immutable/chunks/bXnTD_Tc.js","_app/immutable/chunks/BSEqbe-k.js","_app/immutable/chunks/DXH-uOA6.js","_app/immutable/chunks/B1QKVfla.js","_app/immutable/entry/app.CzdTHWmY.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
	
	nodes: [
		__memo(() => import('./nodes/0.js')),
		__memo(() => import('./nodes/1.js')),
		__memo(() => import('./nodes/2.js')),
		__memo(() => import('./nodes/3.js')),
		__memo(() => import('./nodes/4.js')),
		__memo(() => import('./nodes/5.js')),
		__memo(() => import('./nodes/6.js')),
		__memo(() => import('./nodes/7.js')),
		__memo(() => import('./nodes/8.js')),
		__memo(() => import('./nodes/9.js')),
		__memo(() => import('./nodes/10.js')),
		__memo(() => import('./nodes/11.js')),
		__memo(() => import('./nodes/12.js')),
		__memo(() => import('./nodes/13.js')),
		__memo(() => import('./nodes/14.js')),
		__memo(() => import('./nodes/15.js')),
		__memo(() => import('./nodes/16.js'))
	],
	remotes: {
		
	},
	routes: [
		{
			id: "/",
			pattern: /^\/$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 2 },
			endpoint: null
		},
		{
			id: "/blank.html",
			pattern: /^\/blank\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 3 },
			endpoint: null
		},
		{
			id: "/broken.html",
			pattern: /^\/broken\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 4 },
			endpoint: null
		},
		{
			id: "/direct.html",
			pattern: /^\/direct\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 5 },
			endpoint: null
		},
		{
			id: "/inline-a.html",
			pattern: /^\/inline-a\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 6 },
			endpoint: null
		},
		{
			id: "/inline-b.html",
			pattern: /^\/inline-b\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 7 },
			endpoint: null
		},
		{
			id: "/lifetime-a.html",
			pattern: /^\/lifetime-a\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 8 },
			endpoint: null
		},
		{
			id: "/lifetime-b.html",
			pattern: /^\/lifetime-b\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 9 },
			endpoint: null
		},
		{
			id: "/lifetime-c.html",
			pattern: /^\/lifetime-c\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 10 },
			endpoint: null
		},
		{
			id: "/live.html",
			pattern: /^\/live\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 11 },
			endpoint: null
		},
		{
			id: "/notes.html",
			pattern: /^\/notes\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 12 },
			endpoint: null
		},
		{
			id: "/page-1.html",
			pattern: /^\/page-1\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 13 },
			endpoint: null
		},
		{
			id: "/page-2.html",
			pattern: /^\/page-2\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 14 },
			endpoint: null
		},
		{
			id: "/relate/[id]/[file]",
			pattern: /^\/relate\/([^/]+?)\/([^/]+?)\/?$/,
			params: [{"name":"id","optional":false,"rest":false,"chained":false},{"name":"file","optional":false,"rest":false,"chained":false}],
			page: null,
			endpoint: __memo(() => import('./entries/endpoints/relate/_id_/_file_/_server.ts.js'))
		},
		{
			id: "/switch.html",
			pattern: /^\/switch\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 15 },
			endpoint: null
		},
		{
			id: "/two-graphs.html",
			pattern: /^\/two-graphs\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 16 },
			endpoint: null
		}
	],
	prerendered_routes: new Set([]),
	matchers: async () => {
		return {};
	},
	server_assets: {}
}
})();
