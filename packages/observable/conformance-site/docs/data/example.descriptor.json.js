import {descriptor} from "@relate/contrib-observable/loader";
import source from "../lib/example.js";

await descriptor("example", source, {indexes: [{label: "Page", property: "id"}]});
