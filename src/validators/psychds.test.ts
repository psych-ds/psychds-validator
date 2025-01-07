import { initializePlatform, path } from "../utils/platform.ts";
import { validate } from "./psychds.ts";
import { readFileTree } from "../files/deno.ts";
import { ValidatorOptions } from "../setup/options.ts";
import { assertEquals, assertExists } from "../deps/asserts.ts";
import type { ValidationResult } from "../types/validation-result.ts";

/**
 * Helper function to validate a dataset
 * @param datasetName - Name of the dataset directory
 * @param type - Whether it's a valid or invalid dataset
 */
async function validateDataset(
  datasetName: string,
  type: "valid" | "invalid",
): Promise<ValidationResult> {
  const PATH = `test_data/${type}_datasets/${datasetName}`;
  const absolutePath = path.resolve(PATH);
  const tree = await readFileTree(absolutePath);
  return validate(tree, { datasetPath: PATH } as ValidatorOptions);
}

Deno.test({
  name: "test validate (valid datasets)",
  sanitizeResources: false,
  fn: async (t) => {
    await initializePlatform();

    const validDatasets = [
      {
        name: "bfi-dataset",
        description: "Basic dataset with standard structure",
      },
      {
        name: "complex-metadata-dataset",
        description: "Dataset with complex metadata structure",
      },
      {
        name: "face-body",
        description: "Dataset with multiple data types",
      },
      {
        name: "mistakes-corrected-dataset",
        description: "Dataset with corrected validation issues",
      },
      {
        name: "nih-reviews",
        description: "Dataset with review data structure",
      },
    ];

    for (const dataset of validDatasets) {
      await t.step(dataset.name, async () => {
        const result = await validateDataset(dataset.name, "valid");
        assertEquals(result.valid, true, `${dataset.name} should be valid`);
        assertExists(result.summary, "Should include summary information");
        assertExists(result.summary.totalFiles, "Should include file count");
      });
    }
  },
});

Deno.test({
  name: "test validate (invalid datasets)",
  sanitizeResources: false,
  fn: async (t) => {
    const invalidDatasets = [
      {
        name: "bfi-dataset",
        description: "Dataset with structural issues",
      },
      {
        name: "complex-metadata-dataset",
        description: "Dataset with metadata validation issues",
      },
      {
        name: "face-body",
        description: "Dataset with file organization issues",
      },
      {
        name: "informative-mistakes-dataset",
        description: "Dataset with multiple validation issues",
      },
      {
        name: "nih-reviews",
        description: "Dataset with schema compliance issues",
      },
    ];

    for (const dataset of invalidDatasets) {
      await t.step(dataset.name, async () => {
        const result = await validateDataset(dataset.name, "invalid");
        assertEquals(result.valid, false, `${dataset.name} should be invalid`);
      });
    }
  },
});
