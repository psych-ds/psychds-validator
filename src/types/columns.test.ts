import { assertEquals } from "../deps/asserts.ts";
import { ColumnsMap } from "./columns.ts";

Deno.test("ColumnsMap", async (t) => {
  await t.step("get is accessible with square bracket notation", () => {
    const columns = new ColumnsMap();
    columns["a"] = ["0"];
    assertEquals(columns["a"], ["0"]);
  });
  await t.step("preserves insertion order of string keys", () => {
    const columns = new ColumnsMap();
    columns["a"] = ["0"];
    columns["c"] = ["1"];
    columns["b"] = ["2"];
    assertEquals(Object.keys(columns), ["a", "c", "b"]);
    assertEquals(columns["a"], ["0"]);
  });
  await t.step("keys are accessible with Object.keys", () => {
    const columns = new ColumnsMap();
    columns["a"] = ["0"];
    columns["b"] = ["1"];
    columns[0] = ["2"];
    assertEquals(Object.keys(columns), ["0", "a", "b"]);
  });
  await t.step("reserved names like 'size' can be used as columns (issue #108)", () => {
    const columns = new ColumnsMap();
    columns["size"] = ["0"];
    assertEquals(columns["size"], ["0"]);
    assertEquals(Object.keys(columns), ["size"]);
  });
});
