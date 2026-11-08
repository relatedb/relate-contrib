import {descriptor} from "@relate/observable/loader";
import source from "../lib/example.js";

await descriptor("example", source, {indexes: [{label: "Page", property: "id"}]});
