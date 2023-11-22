import { Summary } from './summary.ts'
import { assertEquals } from '../deps/asserts.ts'

Deno.test('Summary class and helper functions', async (t) => {
  await t.step('Constructor succeeds, format outPut', () => {
    const sum = new Summary()
    assertEquals(Object.keys(sum.formatOutput()).length,6)
  })
})