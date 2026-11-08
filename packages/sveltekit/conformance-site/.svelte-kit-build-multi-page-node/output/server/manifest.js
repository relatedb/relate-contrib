export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	app_dir: "_app",
	app_path: "_app",
	assets: new Set(["descriptor-b.json","descriptor-broken.json","descriptor-mismatch.json","graph-a.json","graph-b.json"]),
	mime_types: {".json":"application/json",".html":"text/html"},
	client: {start:"_app/immutable/entry/start.Dv5Xnt1-.js",app:"_app/immutable/entry/app.iEf5ohdH.js",imports:["_app/immutable/entry/start.Dv5Xnt1-.js","_app/immutable/entry/payload.DSmR2FwN.js","_app/immutable/chunks/DclECHGd.js","_app/immutable/chunks/Dnv1Z26g.js","_app/immutable/chunks/CSaxVGkT.js","_app/immutable/chunks/k45OOpT8.js","_app/immutable/chunks/Dj1kWg24.js","_app/immutable/entry/app.iEf5ohdH.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
	
	nodes: [
		__memo(() => import('./nodes/0.js')),
		__memo(() => import('./nodes/1.js')),
		__memo(() => import('./nodes/11.js'))
	],
	remotes: {
		
	},
	routes: [
		{
			id: "/live.html",
			pattern: /^\/live\.html\/?$/,
			params: [],
			page: { layouts: [0,], errors: [1,], leaf: 2 },
			endpoint: null
		}
	],
	prerendered_routes: new Set(["/","/__data.json","/blank.html","/blank.html__data.json","/broken.html","/broken.html__data.json","/direct.html","/direct.html__data.json","/inline-a.html","/inline-a.html__data.json","/inline-b.html","/inline-b.html__data.json","/lifetime-a.html","/lifetime-a.html__data.json","/lifetime-b.html","/lifetime-b.html__data.json","/lifetime-c.html","/lifetime-c.html__data.json","/notes.html","/notes.html__data.json","/page-1.html","/page-1.html__data.json","/page-2.html","/page-2.html__data.json","/switch.html","/switch.html__data.json","/two-graphs.html","/two-graphs.html__data.json","/relate/example/descriptor.json","/relate/example/graph.00d89abba949.json","/relate/small/descriptor.json","/relate/small/graph.ac922b5a1bee.json","/relate/other/descriptor.json","/relate/other/graph.e77d90cdbc30.json"]),
	matchers: async () => {
		return {};
	},
	server_assets: {}
}
})();
