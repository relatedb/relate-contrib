export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15')
];

export const server_loads = [0];

export const dictionary = {
		"/": [2],
		"/blank.html": [3],
		"/broken.html": [4],
		"/direct.html": [5],
		"/inline-a.html": [6],
		"/inline-b.html": [7],
		"/lifetime-a.html": [8],
		"/lifetime-b.html": [9],
		"/lifetime-c.html": [10],
		"/live.html": [11],
		"/notes.html": [12],
		"/page-1.html": [13],
		"/page-2.html": [14],
		"/two-graphs.html": [15]
	};

export const hooks = {
	handleError: (({ kind, error }) => { if (kind === 'unknown') { console.error(error); } }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export const get_error_template = () => import('../shared/error-template.js').then(m => m.default);