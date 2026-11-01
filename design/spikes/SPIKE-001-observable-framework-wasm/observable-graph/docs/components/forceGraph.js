import * as d3 from "npm:d3";

// Force-directed graph. Copies its input because d3's force simulation mutates
// node and link objects (adds x/y/vx/vy and replaces link endpoints).
export function forceGraph(graph, {width = 640, height = 420} = {}) {
  const nodes = graph.nodes.map((n) => ({...n}));
  const links = graph.links.map((l) => ({...l}));
  const labels = [...new Set(nodes.map((n) => n.label))];
  const color = d3.scaleOrdinal(labels, d3.schemeTableau10);

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto;");

  if (nodes.length === 0) {
    const empty = svg.node();
    empty.stop = () => {};
    return empty;
  }

  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", 1.5);
  link.append("title").text((d) => d.type);

  const node = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g");
  node.append("circle").attr("r", 10).attr("fill", (d) => color(d.label)).attr("stroke", "#fff").attr("stroke-width", 1.5);
  node.append("text").text((d) => d.name).attr("x", 14).attr("y", 4).attr("font-size", 11).attr("fill", "currentColor");
  node.append("title").text((d) => `${d.label}\n${JSON.stringify(d.properties)}`);

  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(70))
    .force("charge", d3.forceManyBody().strength(-220))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

  node.call(
    d3
      .drag()
      .on("start", (event) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on("drag", (event) => {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      })
      .on("end", (event) => {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      })
  );

  // `invalidation` exists only inside page cells, so the caller stops the
  // simulation: `invalidation.then(() => chart.stop())`.
  const element = svg.node();
  element.stop = () => simulation.stop();
  return element;
}
