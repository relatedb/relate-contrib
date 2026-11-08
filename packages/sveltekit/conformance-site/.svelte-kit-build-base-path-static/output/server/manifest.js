export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	app_dir: "_app",
	app_path: "docs/_app",
	assets: new Set(["descriptor-b.json","descriptor-broken.json","descriptor-mismatch.json","graph-a.json","graph-b.json"]),
	mime_types: {".json":"application/json",".html":"text/html"},
	client: {start:"_app/immutable/entry/start.DK-_fVFa.js",app:"_app/immutable/entry/app.DeweVr0C.js",imports:["_app/immutable/entry/start.DK-_fVFa.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/DclECHGd.js","_app/immutable/chunks/BOLDg7ec.js","_app/immutable/chunks/CIwQ7RWn.js","_app/immutable/chunks/B17XUGQh.js","_app/immutable/chunks/DVqHga60.js","_app/immutable/entry/app.DeweVr0C.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
	
	nodes: [
		__memo(() => import('./nodes/0.js')),
		__memo(() => import('./nodes/1.js'))
	],
	remotes: {
		
	},
	routes: [
		
	],
	prerendered_routes: new Set(["/docs/","/docs/__data.json","/docs/blank.html","/docs/blank.html__data.json","/docs/broken.html","/docs/broken.html__data.json","/docs/direct.html","/docs/direct.html__data.json","/docs/inline-a.html","/docs/inline-a.html__data.json","/docs/inline-b.html","/docs/inline-b.html__data.json","/docs/lifetime-a.html","/docs/lifetime-a.html__data.json","/docs/lifetime-b.html","/docs/lifetime-b.html__data.json","/docs/lifetime-c.html","/docs/lifetime-c.html__data.json","/docs/live.html","/docs/live.html__data.json","/docs/notes.html","/docs/notes.html__data.json","/docs/page-1.html","/docs/page-1.html__data.json","/docs/page-2.html","/docs/page-2.html__data.json","/docs/two-graphs.html","/docs/two-graphs.html__data.json","/docs/relate/example/descriptor.json","/docs/relate/example/graph.00d89abba949.json","/docs/relate/small/descriptor.json","/docs/relate/small/graph.ac922b5a1bee.json","/docs/relate/other/descriptor.json","/docs/relate/other/graph.e77d90cdbc30.json"]),
	matchers: async () => {
		return {};
	},
	server_assets: {}
}
})();
