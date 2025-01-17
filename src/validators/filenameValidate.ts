/**
 * @fileoverview Validates filenames against schema rules and checks for proper formatting
 * and keyword usage according to Psych-DS specifications.
 */

import { CheckFunction, RuleCheckFunction } from "../types/check.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";
import { psychDSContext } from "../schema/context.ts";
import { GenericRule, GenericSchema } from "../types/schema.ts";
import { SEP } from "../utils/platform.ts";
import { Severity } from "../types/issues.ts";

/** Array of validation checks to run on filenames */
const CHECKS: CheckFunction[] = [
  checkRules,
];

/**
 * Main entry point for filename validation
 * @param schema - The schema to validate against
 * @param context - Context object containing file information
 * @returns Promise that resolves when validation is complete
 */
export async function filenameValidate(
  schema: GenericSchema,
  context: psychDSContext,
) {
  for (const check of CHECKS) {
    await check(schema, context);
  }
  return Promise.resolve();
}

/**
 * Checks if a file is located at the root level of the directory structure
 * @param context - Context object containing file information
 * @returns boolean indicating if file is at root
 */
export function isAtRoot(context: psychDSContext) {
  if (context.file.path.split(SEP).length !== 2) {
    return false;
  }
  return true;
}

/** Array of specific rule validation functions */
const ruleChecks: RuleCheckFunction[] = [
  extensionMismatch,
  keywordCheck,
];

/**
 * Applies all rule checks to a file context
 * @param schema - Schema to validate against
 * @param context - Context object containing file information
 * @returns Promise that resolves when rule checks are complete
 */
export function checkRules(schema: GenericSchema, context: psychDSContext) {
  if (context.filenameRules.length === 1) {
    // Single rule case - apply all checks
    for (const check of ruleChecks) {
      check(
        context.filenameRules[0],
        schema as unknown as GenericSchema,
        context,
      );
    }
  } else {
    // Multiple rules case - track issues for each rule
    const ogIssues = context.issues;
    const noIssues: [string, DatasetIssues][] = [];
    const someIssues: [string, DatasetIssues][] = [];

    for (const path of context.filenameRules) {
      const tempIssues = new DatasetIssues();
      context.issues = tempIssues;

      for (const check of ruleChecks) {
        check(path, schema as unknown as GenericSchema, context);
      }

      tempIssues.size
        ? someIssues.push([path, tempIssues])
        : noIssues.push([path, tempIssues]);
    }

    if (noIssues.length) {
      // Use first valid rule if any exist
      context.issues = ogIssues;
      context.filenameRules = [noIssues[0][0]];
    } else if (someIssues.length) {
      // All rules had issues
      context.issues = ogIssues;
      context.issues.addSchemaIssue("AllFilenameRulesHaveIssues", [
        {
          ...context.file,
          evidence: `Rules that matched with issues: ${
            someIssues
              .map((x) => x[0])
              .join(", ")
          }`,
        },
      ]);
    }
  }
  return Promise.resolve();
}

/**
 * Checks if file extension matches allowed extensions in rule
 * @param path - Path to rule in schema
 * @param schema - Schema containing rules
 * @param context - Context object with file information
 */
export function extensionMismatch(
  path: string,
  schema: GenericSchema,
  context: psychDSContext,
) {
  const rule = schema[path] as GenericRule;
  if (
    Array.isArray(rule.extensions) &&
    !rule.extensions.includes(context.extension)
  ) {
    context.issues.addSchemaIssue("ExtensionMismatch", [
      { ...context.file, evidence: `Rule: ${path}` },
    ]);
  }
}

/**
 * Validates filename keywords against schema specifications
 * Checks both keyword formatting and if only official keywords are used
 * @param path - Path to rule in schema
 * @param schema - Schema containing rules
 * @param context - Context object with file information
 */
export function keywordCheck(
  path: string,
  schema: GenericSchema,
  context: psychDSContext,
) {
  const rule = schema[path];
  if ("usesKeywords" in rule && rule.usesKeywords) {
    // Check keyword formatting
    if ("fileRegex" in rule) {
      const fileRegex = new RegExp(rule.fileRegex as unknown as string);
      const regexMatch = context.file.name.match(fileRegex);
      if ((regexMatch && regexMatch[0] !== context.file.name) || !regexMatch) {
        context.issues.addSchemaIssue(
          "FilenameKeywordFormattingError",
          [context.file],
        );
      }
    }

    // Verify keywords are in official list
    if (
      !Object.keys(context.keywords).every((keyword) =>
        keyword in schema["meta.context.context.properties.keywords.properties"]
      )
    ) {
      context.issues.addSchemaIssue(
        "FilenameUnofficialKeywordWarning",
        [context.file],
      );
    }
  }
}

/**
 * Checks for missing required rules in the dataset
 * Examines rulesRecord to identify which schema rules weren't satisfied
 * @param schema - Schema containing rules
 * @param rulesRecord - Record of which rules were satisfied
 * @param issues - Issues collection to add any found issues to
 */
export function checkMissingRules(
  schema: GenericSchema,
  rulesRecord: Record<string, boolean>,
  issues: DatasetIssues,
) {
  Object.keys(rulesRecord)
    .filter((key) => {
      return rulesRecord[key] === false;
    })
    .map((key) => {
      const node = schema[key] as GenericRule;
      issues.add({
        key: node.code as string,
        reason: node.reason as string,
        severity: node.level as Severity,
      });
    });
}
