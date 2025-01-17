import { assertEquals } from "../deps/asserts.ts";
import { parseOptions } from "./options.ts";

Deno.test("options parsing", async (t) => {
  await t.step("verify basic arguments work", async () => {
    const options = await parseOptions(["my_dataset", "--json"]);
    assertEquals(options, {
      datasetPath: "my_dataset",
      json: true,
      schema: "1.4.0",
      debug: "error",
      verbose: undefined,
      useEvents: undefined,
      showWarnings: undefined,
    });
  });

  await t.step("verify all options work", async () => {
    const options = await parseOptions([
      "my_dataset",
      "--json",
      "--schema",
      "1.0.0",
      "--verbose",
      "--debug",
      "info",
      "--showWarnings",
    ]);
    assertEquals(options, {
      datasetPath: "my_dataset",
      json: true,
      schema: "1.0.0",
      debug: "info",
      verbose: true,
      useEvents: undefined,
      showWarnings: true,
    });
  });
});
