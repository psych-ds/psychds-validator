import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "../deps/asserts.ts";
import { loadSchema } from "./loadSchema.ts";

// Store the original fetch function
const originalFetch = globalThis.fetch;

// Mock fetch function to simulate API responses without making actual network requests
globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
  if (typeof input === "string") {
    // Simulate response for schema.json
    if (input.includes("schema.json")) {
      return Promise.resolve(
        new Response(JSON.stringify({
          rules: {
            files: {
              common: {
                core: {
                  README: {
                    level: "warning",
                    stem: "README",
                    extensions: [".md", ".txt"],
                    arbitraryNesting: true,
                    baseDir: "someDir",
                    code: "someCode",
                    reason: "someReason",
                  },
                },
              },
            },
          },
          objects: {},
          schemaOrg: {},
        })),
      );
    } // Simulate response for schemaorg.json
    else if (input.includes("schemaorg.json")) {
      return Promise.resolve(new Response(JSON.stringify({})));
    }
  }
  // Return 404 for any other requests
  return Promise.resolve(new Response(null, { status: 404 }));
};

// Main test suite for LoadSidecar functionality
Deno.test({
  name: "test context LoadSidecar",
  fn: async (t) => {
    // Test case: Verify that the top-level files document is read correctly
    await t.step("reads in top level files document", async () => {
      const schemaDefs = await loadSchema();
      // Verify the structure and content of the loaded schema
      if (
        typeof schemaDefs.rules.files.common === "object" &&
        schemaDefs.rules.files.common.core !== null
      ) {
        const top_level = schemaDefs.rules.files.common.core as Record<
          string,
          unknown
        >;
        if (Object.prototype.hasOwnProperty.call(top_level, "README")) {
          const readme = top_level.README as Record<string, unknown>;
          // Assert specific properties of the README object
          assertEquals(readme.level, "warning");
          assertEquals(readme.stem, "README");
          assertEquals(readme.extensions, [".md", ".txt"]);

          // Verify existence of other properties without asserting their values
          assert("arbitraryNesting" in readme);
          assert("baseDir" in readme);
          assert("code" in readme);
          assert("reason" in readme);
        } else {
          assert(false, "README property not found in top_level");
        }
      } else {
        assert(false, "failed to test schema defs");
      }
    });

    // Test case: Verify that all schema files are loaded
    await t.step("loads all schema files", async () => {
      const schemaDefs = await loadSchema();
      assert(
        typeof schemaDefs.objects === "object",
        "objects should be an object",
      );
      assert(typeof schemaDefs.rules === "object", "rules should be an object");
    });

    // Test case: Verify version format checking functionality
    await t.step("version format checking", async () => {
      // Test valid version formats
      await assert(loadSchema("latest"), "latest should be a valid version");
      await assert(loadSchema("1.0.0"), "1.0.0 should be a valid version");
      await assert(
        loadSchema("10.20.30"),
        "10.20.30 should be a valid version",
      );

      // Test invalid version formats
      await assertRejects(
        () => loadSchema("1"),
        Error,
        "Invalid version format",
        "Single number should be invalid",
      );
      await assertRejects(
        () => loadSchema("1.0"),
        Error,
        "Invalid version format",
        "Two number format should be invalid",
      );
      await assertRejects(
        () => loadSchema("1.0.0.0"),
        Error,
        "Invalid version format",
        "Four number format should be invalid",
      );
      await assertRejects(
        () => loadSchema("v1.0.0"),
        Error,
        "Invalid version format",
        "Version with v prefix should be invalid",
      );
      await assertRejects(
        () => loadSchema("1.0.0-alpha"),
        Error,
        "Invalid version format",
        "Version with suffix should be invalid",
      );
      await assertRejects(
        () => loadSchema("not-a-version"),
        Error,
        "Invalid version format",
        "Non-numeric string should be invalid",
      );
    });
  },
  // Disable resource and op sanitizers to allow for mocked fetch
  sanitizeResources: false,
  sanitizeOps: false,
});

// Offline fallback: when the versioned schema can't be fetched (e.g. no
// network), loadSchema must fall back to the default schema bundled in the
// package. Loading those bundled files resolves the module's own directory via
// getDirname(), which is the step that broke on Windows (deriving a path from
// import.meta.url left "/D:/..."). loadDefaultSchemas() swallows a read failure
// and leaves the defaults empty, so the existing tests pass even when that path
// is broken because their mocked fetch succeeds and the defaults are never
// used. This test forces the fetch to fail so the bundled schema must load and
// be used, failing on any platform where the module directory can't be
// resolved or the bundled files aren't found.
Deno.test({
  name: "falls back to the bundled default schema when offline",
  fn: async () => {
    const mockedFetch = globalThis.fetch;
    // Simulate being offline: every request rejects.
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    try {
      // A version not requested by the other tests, so the module-level cache
      // can't satisfy this call with a previously fetched schema.
      const schema = await loadSchema("9.9.9");

      // If getDirname() produced an unreadable path (the Windows bug) or the
      // bundled files weren't packaged, loadDefaultSchemas() would have left
      // these empty and the fallback would carry nothing. Non-empty here means
      // the bundled schema was read from disk and actually used.
      assertExists(schema.rules, "rules should load from the bundled default");
      assert(
        "common" in (schema.rules.files as Record<string, unknown>),
        "rules.files should be populated from the bundled default schema",
      );
      assert(
        Object.keys(schema.objects as Record<string, unknown>).length > 0,
        "objects should be populated from the bundled default schema",
      );
      assertExists(
        (schema.schemaOrg as Record<string, unknown>).classes,
        "schemaOrg should fall back to the bundled default schemaOrg",
      );
    } finally {
      globalThis.fetch = mockedFetch;
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// Clean-up: Restore the original fetch function after all tests
Deno.test({
  name: "Restore fetch",
  fn: () => {
    globalThis.fetch = originalFetch;
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
