// Module-scope worker client: created by the first island that asks, kept for
// as long as this module stays loaded. Registers one subscription at creation
// so its survival across route changes can be observed.
import {WorkerDb} from "../worker/workerDb.js";

export const moduleId = Math.random().toString(36).slice(2, 8);
export const state = {created: 0, ticks: 0, lastGeneration: null};
let client = null;

export function getClient(graph) {
  if (client === null) {
    client = new WorkerDb({graph});
    client.token = Math.random().toString(36).slice(2, 8);
    state.created++;
    client.subscribe("MATCH (p:Page) RETURN count(p) AS c", null, (e) => {
      state.ticks++;
      state.lastGeneration = e.generation;
    });
  }
  return client;
}
