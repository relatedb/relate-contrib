// covers-ra: FR-003, FR-004
import { describe, expect, it } from "vitest";
import { constraintName, ID_FIELD, SchemaError, validateSchema, type Schema } from "../../src/schema.js";
import { schema } from "../helpers/fixture.js";

const base = (): Schema => structuredClone(schema);
const rejects = (mutate: (s: Schema) => void, pattern: RegExp) => {
  const s = base();
  mutate(s);
  expect(() => validateSchema(s)).toThrow(SchemaError);
  expect(() => validateSchema(s)).toThrow(pattern);
};

describe("a valid schema", () => {
  it("is accepted and normalised", () => {
    const n = validateSchema(schema);
    expect([...n.resources.keys()]).toEqual(["companies", "people", "projects"]);
    const people = n.resources.get("people")!;
    expect(people.label).toBe("Person");
    expect(people.references.get("company")).toEqual({ field: "company", resource: "companies", type: "WORKS_AT", direction: "out" });
  });

  it("does not change the schema it was given", () => {
    const before = JSON.stringify(schema);
    validateSchema(schema);
    expect(JSON.stringify(schema)).toBe(before);
  });

  it("declares id on every resource as a sortable, filterable string", () => {
    for (const r of validateSchema(schema).resources.values()) {
      expect(r.fields.get("id")).toEqual(ID_FIELD);
      expect(ID_FIELD).toMatchObject({ type: "string", sortable: true, filterable: true });
    }
  });

  it("names the constraint on a label's id rel_<Label>_id", () => {
    expect(constraintName("Person")).toBe("rel_Person_id");
  });

  it("defaults a reference's direction to out and keeps an explicit in", () => {
    const s = base();
    s.resources.people!.references = [{ field: "employer", resource: "companies", type: "EMPLOYS", direction: "in" }];
    expect(validateSchema(s).resources.get("people")!.references.get("employer")!.direction).toBe("in");
  });
});

describe("a malformed schema throws, naming the resource and field", () => {
  it("a name outside the pattern", () => {
    rejects((s) => void (s.resources.people!.fields[0]!.name = "first name"), /resource "people".*"first name"/);
    rejects((s) => void (s.resources.people!.label = "Per son"), /resource "people".*label/);
  });
  it("an unknown field type", () => rejects((s) => void ((s.resources.people!.fields[2] as any).type = "date"), /resource "people".*"age".*string, number or boolean/));
  it("a duplicate field", () => rejects((s) => void s.resources.people!.fields.push({ name: "age", type: "number" }), /resource "people".*"age".*twice/));
  it("a field named id", () => rejects((s) => void s.resources.people!.fields.push({ name: "id", type: "string" }), /resource "people".*"id".*implicit/));
  it("a reference to an unknown resource", () => rejects((s) => void (s.resources.people!.references![0]!.resource = "firms"), /resource "people".*"company".*"firms"/));
  it("a reference field that collides with a declared field", () => rejects((s) => void (s.resources.people!.references![0]!.field = "name"), /resource "people".*"name".*already used/));
  it("a reference field named id", () => rejects((s) => void (s.resources.people!.references![0]!.field = "id"), /"id".*reserved|already used/));
  it("searchable on a number", () => rejects((s) => void (s.resources.people!.fields[2]!.searchable = true), /resource "people".*"age".*string field can be searchable/));
  it("a direction other than out or in", () => rejects((s) => void ((s.resources.people!.references![0] as any).direction = "both"), /resource "people".*"company".*direction/));
  it("a non-boolean flag", () => rejects((s) => void ((s.resources.people!.fields[0] as any).sortable = "yes"), /resource "people".*"name".*sortable.*boolean/));
  it("no resources", () => {
    expect(() => validateSchema({ resources: {} })).toThrow(/at least one resource/);
  });
});
