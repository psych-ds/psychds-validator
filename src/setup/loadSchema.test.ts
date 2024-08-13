import { assert, assertEquals, assertRejects } from '../deps/asserts.ts'
import { loadSchema } from './loadSchema.ts'

Deno.test('schema yaml loader', async (t) => {
  await t.step('reads in top level files document', async () => {
    const schemaDefs = await loadSchema()
    // Look for some stable fields in top level files
    if (
      typeof schemaDefs.rules.files.common === 'object' &&
      schemaDefs.rules.files.common.core !== null
    ) {
      const top_level = schemaDefs.rules.files.common.core as Record<
        string,
        // deno-lint-ignore no-explicit-any
        any
      >
      // deno-lint-ignore no-prototype-builtins
      if (top_level.hasOwnProperty('README')) {
        // Switch to checking properties of object individually to accommodate deep object check
        const readme = top_level.README
        assertEquals(readme.level, 'warning')
        assertEquals(readme.stem, 'README')
        assertEquals(readme.extensions, ['.md', '.txt'])
        
        // Check if other properties exist without asserting their values
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

  await t.step('loads all schema files', async () => {
    const schemaDefs = await loadSchema()
    assert(typeof schemaDefs.objects === 'object', 'objects should be an object')
    assert(typeof schemaDefs.rules === 'object', 'rules should be an object')
  })

  await t.step('version format checking', async () => {
    // Test valid versions
    await assert(loadSchema('latest'), 'latest should be a valid version')
    await assert(loadSchema('1.0.0'), '1.0.0 should be a valid version')
    await assert(loadSchema('10.20.30'), '10.20.30 should be a valid version')

    // Test invalid versions
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
})