/**
 * asserts.ts
 * 
 * This file replaces the original implementation that imported from 'deno.land/.../asserts.ts'.
 * It's part of a necessary refactoring to remove Deno-specific dependencies, preparing the
 * codebase for a dnt (Deno to Node.js) build and eventual publication to npm.
 * 
 * The functions in this file provide assertion utilities similar to those in Deno's standard
 * library, but implemented using Node.js's built-in assert module.
 */

// We use node:assert instead of just 'assert' to ensure we're using the built-in Node.js module
// This is more explicit and avoids potential conflicts with other assertion libraries
import assert from 'node:assert';

export { assert };

/**
 * Asserts that two values are deeply equal.
 * @param actual The actual value to compare.
 * @param expected The expected value to compare against.
 * @param msg Optional message to display on assertion failure.
 */
export function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  // Uses deepStrictEqual instead of equal to perform a deep comparison
  // This ensures that nested objects and arrays are compared correctly
  assert.deepStrictEqual(actual, expected, msg);
}

/**
 * Asserts that an object matches the expected partial object.
 * Note: This implementation is equivalent to assertEquals for full object matching.
 * @param actual The actual object to compare.
 * @param expected The expected partial object to compare against.
 * @param msg Optional message to display on assertion failure.
 */
export function assertObjectMatch(actual: Record<string, unknown>, expected: Record<string, unknown>, msg?: string): void {
  // Uses deepStrictEqual here as well, which means this function currently performs a full match
  // In a more complete implementation, we might want to add logic to check if 'expected' is a subset of 'actual'
  assert.deepStrictEqual(actual, expected, msg);
}

/**
 * Asserts that a value is not null or undefined.
 * @param actual The value to check for existence.
 * @param msg Optional message to display on assertion failure.
 */
export function assertExists<T>(actual: T, msg?: string): asserts actual is NonNullable<T> {
  // Uses a simple assertion here, which throws an error if the condition is false
  // The 'asserts actual is NonNullable<T>' clause is a TypeScript type predicate
  // It tells TypeScript that if this function returns normally, 'actual' is not null or undefined
  assert(actual !== null && actual !== undefined, msg);
}

/**
 * Asserts that a condition is truthy.
 * @param condition The condition to evaluate.
 * @param msg Optional message to display on assertion failure.
 */
export function assertTrue(condition: unknown, msg?: string): asserts condition {
  // Uses the double negation (!!) to convert the condition to a boolean
  // This ensures that truthy values (like non-empty strings or numbers) are considered valid
  assert(!!condition, msg || `Expected ${condition} to be truthy`);
}

// We use a type alias with a constructor signature that can take any number of arguments
// The 'never[]' type ensures maximum flexibility while still maintaining type safety
type ErrorClass = new (...args: never[]) => Error;

/**
 * Asserts that a function rejects with an error.
 * @param fn The async function expected to reject.
 * @param errorClass Optional expected error class.
 * @param msgIncludes Optional string that the error message should include.
 * @param msg Optional message to display on assertion failure.
 */
export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: ErrorClass,
  msgIncludes?: string,
  msg?: string
): Promise<void> {
  try {
    await fn();
    // If the function doesn't throw, we fail the assertion
    assert.fail(msg || 'Expected function to throw');
  } catch (error) {
    if (errorClass) {
      // We check if the error is an instance of the expected class
      // This allows for checking specific error types
      assert(error instanceof errorClass, msg || `Expected error to be instance of ${errorClass.name}`);
    }
    if (msgIncludes && error instanceof Error) {
      // We check if the error message includes the expected string
      // This allows for more specific error checking beyond just the error type
      assert(error.message.includes(msgIncludes), msg || `Expected error message to include "${msgIncludes}"`);
    }
  }
}