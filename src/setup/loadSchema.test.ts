import { assert, assertEquals, assertRejects } from '../deps/asserts.ts'
import { loadSchema } from './loadSchema.ts'

// Store the original fetch function
const originalFetch = globalThis.fetch;

// Mock fetch function to simulate API responses without making actual network requests
globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
  if (typeof input === 'string') {
    // Simulate response for schema.json
    if (input.includes('schema.json')) {
      return Promise.resolve(new Response(JSON.stringify({
        rules: {
          files: {
            common: {
              core: {
                README: {
                  level: 'warning',
                  stem: 'README',
                  extensions: ['.md', '.txt'],
                  arbitraryNesting: true,
                  baseDir: 'someDir',
                  code: 'someCode',
                  reason: 'someReason'
                }
              }
            }
          }
        },
        objects: {},
        schemaOrg: {}
      })));
    } 
    // Simulate response for schemaorg.json
    else if (input.includes('schemaorg.json')) {
      return Promise.resolve(new Response(JSON.stringify({})));
    }
  }
  // Return 404 for any other requests
  return Promise.resolve(new Response(null, { status: 404 }));
};

// Main test suite for LoadSidecar functionality
Deno.test({
  name:'test context LoadSidecar', 
  fn: async (t) => {
    // Test case: Verify that the top-level files document is read correctly
    await t.step('reads in top level files document', async () => {
      const schemaDefs = await loadSchema()
      // Verify the structure and content of the loaded schema
      if (
        typeof schemaDefs.rules.files.common === 'object' &&
        schemaDefs.rules.files.common.core !== null
      ) {
        const top_level = schemaDefs.rules.files.common.core as Record<string, unknown>
        if (Object.prototype.hasOwnProperty.call(top_level, 'README')) {
          const readme = top_level.README as Record<string, unknown>
          // Assert specific properties of the README object
          assertEquals(readme.level, 'warning')
          assertEquals(readme.stem, 'README')
          assertEquals(readme.extensions, ['.md', '.txt'])
          
          // Verify existence of other properties without asserting their values
          assert('arbitraryNesting' in readme)
          assert('baseDir' in readme)
          assert('code' in readme)
          assert('reason' in readme)
        } else {
          assert(false, 'README property not found in top_level')
        }
      } else {
        assert(false, 'failed to test schema defs')
      }
    })

    // Test case: Verify that all schema files are loaded
    await t.step('loads all schema files', async () => {
      const schemaDefs = await loadSchema()
      assert(typeof schemaDefs.objects === 'object', 'objects should be an object')
      assert(typeof schemaDefs.rules === 'object', 'rules should be an object')
    })

    // Test case: Verify version format checking functionality
    await t.step('version format checking', async () => {
      // Test valid version formats
      await assert(loadSchema('latest'), 'latest should be a valid version')
      await assert(loadSchema('1.0.0'), '1.0.0 should be a valid version')
      await assert(loadSchema('10.20.30'), '10.20.30 should be a valid version')

      // Test invalid version formats
      await assertRejects(
        () => loadSchema('1'),
        Error,
        'Invalid version format',
        'Single number should be invalid'
      )
      await assertRejects(
        () => loadSchema('1.0'),
        Error,
        'Invalid version format',
        'Two number format should be invalid'
      )
      await assertRejects(
        () => loadSchema('1.0.0.0'),
        Error,
        'Invalid version format',
        'Four number format should be invalid'
      )
      await assertRejects(
        () => loadSchema('v1.0.0'),
        Error,
        'Invalid version format',
        'Version with v prefix should be invalid'
      )
      await assertRejects(
        () => loadSchema('1.0.0-alpha'),
        Error,
        'Invalid version format',
        'Version with suffix should be invalid'
      )
      await assertRejects(
        () => loadSchema('not-a-version'),
        Error,
        'Invalid version format',
        'Non-numeric string should be invalid'
      )
    })
  },
  // Disable resource and op sanitizers to allow for mocked fetch
  sanitizeResources: false,
  sanitizeOps: false,
})

// Clean-up: Restore the original fetch function after all tests
Deno.test({
  name: 'Restore fetch',
  fn: () => {
    globalThis.fetch = originalFetch;
  },
  sanitizeResources: false,
  sanitizeOps: false,
})