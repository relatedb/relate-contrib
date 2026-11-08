// empty during dev
export const immutable = [];
export const prerendered = [];

export const assets = [
	{"path":"descriptor-b.json"},
	{"path":"descriptor-broken.json"},
	{"path":"descriptor-mismatch.json"},
	{"path":"graph-a.json"},
	{"path":"graph-b.json"}
];

export const routes = [
	{"id":"/","page":true,"endpoint":false},
	{"id":"/blank.html","page":true,"endpoint":false},
	{"id":"/broken.html","page":true,"endpoint":false},
	{"id":"/direct.html","page":true,"endpoint":false},
	{"id":"/inline-a.html","page":true,"endpoint":false},
	{"id":"/inline-b.html","page":true,"endpoint":false},
	{"id":"/lifetime-a.html","page":true,"endpoint":false},
	{"id":"/lifetime-b.html","page":true,"endpoint":false},
	{"id":"/lifetime-c.html","page":true,"endpoint":false},
	{"id":"/live.html","page":true,"endpoint":false},
	{"id":"/notes.html","page":true,"endpoint":false},
	{"id":"/page-1.html","page":true,"endpoint":false},
	{"id":"/page-2.html","page":true,"endpoint":false},
	{"id":"/relate/[id]/[file]","page":false,"endpoint":true},
	{"id":"/switch.html","page":true,"endpoint":false},
	{"id":"/two-graphs.html","page":true,"endpoint":false}
];