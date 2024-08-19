import { assertEquals } from "../deps/asserts.ts";
import { psychDSFileDeno } from "../files/deno.ts";
import { FileIgnoreRules } from "../files/ignore.ts";
import { parseCSV } from "./csv.ts";
import { ColumnsMap } from "../types/columns.ts";

const ignore = new FileIgnoreRules([]);

Deno.test("Test parseCSV", async (t) => {
  await t.step("csv exists", async () => {
    const file = new psychDSFileDeno("test_data/testfiles", "csv.csv", ignore);
    const result = await file
      .text()
      .then((text) => parseCSV(text))
      .catch((_error) => {
        return {
          "columns": new Map<string, string[]>() as ColumnsMap,
          "issues": [],
        };
      });
    assertEquals(result["issues"], []);
  });

  await t.step("Header missing", async () => {
    const file = new psychDSFileDeno(
      "test_data/testfiles",
      "noHeader.csv",
      ignore,
    );
    const result = await file
      .text()
      .then((text) => parseCSV(text))
      .catch((_error) => {
        return {
          "columns": new Map<string, string[]>() as ColumnsMap,
          "issues": [],
        };
      });
    assertEquals(result["issues"][0]["issue"], "NoHeader");
  });
  await t.step("Header row mismatch", async () => {
    const file = new psychDSFileDeno(
      "test_data/testfiles",
      "headerRowMismatch.csv",
      ignore,
    );
    const result = await file
      .text()
      .then((text) => parseCSV(text))
      .catch((_error) => {
        return {
          "columns": new Map<string, string[]>() as ColumnsMap,
          "issues": [],
        };
      });
    assertEquals(result["issues"][0]["issue"], "HeaderRowMismatch");
  });
  await t.step("Row_id values not unique", async () => {
    const file = new psychDSFileDeno(
      "test_data/testfiles",
      "rowidValuesNotUnique.csv",
      ignore,
    );
    const result = await file
      .text()
      .then((text) => parseCSV(text))
      .catch((_error) => {
        return {
          "columns": new Map<string, string[]>() as ColumnsMap,
          "issues": [],
        };
      });
    assertEquals(result["issues"][0]["issue"], "RowidValuesNotUnique");
  });
});
