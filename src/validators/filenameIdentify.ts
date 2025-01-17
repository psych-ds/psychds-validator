/**
 * @fileoverview Handles identification of files against Psych-DS schema rules.
 * This module attempts to match files with appropriate schema rules by analyzing
 * their suffixes, directory locations, and extensions. The goal is to
 * find the most specific matching rule for validation.
 */

// @ts-nocheck: untyped functions
import { GenericSchema } from "../types/schema.ts";
import { CheckFunction } from "../types/check.ts";

/** Array of validation checks to run for file identification */
const CHECKS: CheckFunction[] = [
  findRuleMatches,
];

/**
 * Main entry point for identifying which schema rules apply to a file
 * @param schema - The schema to check against
 * @param context - Context containing file information
 */
export async function filenameIdentify(schema, context) {
  for (const check of CHECKS) {
    await check(schema as unknown as GenericSchema, context);
  }
}

/**
 * Checks base directory rules for validity
 * Validates directories against core schema rules and updates rule record accordingly
 * @param schema - The schema containing rules
 * @param rulesRecord - Record tracking which rules have been satisfied
 * @param baseDirs - Array of base directories to check
 */
export function checkDirRules(schema, rulesRecord, baseDirs) {
  Object.keys(rulesRecord)
    .filter((key) => {
      return (key.startsWith("rules.files.common.core") &&
        !rulesRecord[key]);
    })
    .map((key) => {
      const node = schema[key];
      if (
        node.directory === true &&
        baseDirs.includes(node.path)
      ) {
        rulesRecord[key] = true;
      }
    });
}

/**
 * Initializes tracking of file rules from schema
 * Creates a record of all file rules to track which ones are satisfied
 * @param schema - The schema containing rules
 * @param rulesRecord - Object to track rule satisfaction
 * @returns Promise that resolves when initialization is complete
 */
export function findFileRules(schema, rulesRecord) {
  const schemaPath = "rules.files";

  Object.keys(schema[schemaPath]).map((key) => {
    const path = `${schemaPath}.${key}`;
    _findFileRules(schema[path], path, rulesRecord);
  });

  return Promise.resolve();
}

/**
 * Recursive helper for finding file rules in schema
 * Traverses schema tree to identify and record all file validation rules
 * @param node - Current schema node being examined
 * @param path - Path to current node in schema
 * @param rulesRecord - Object tracking rule satisfaction
 */
export function _findFileRules(node, path, rulesRecord) {
  if (
    ("baseDir" in node) &&
    ("extensions" in node) &&
    (("suffix" in node) || ("stem" in node))
  ) {
    rulesRecord[path] = false;
    return;
  }
  // Handle directory specifications
  if (
    "path" in node &&
    "directory" in node
  ) {
    rulesRecord[path] = false;
    return;
  } else {
    Object.keys(node).map((key) => {
      if (
        typeof node[key] === "object"
      ) {
        _findFileRules(node[key], `${path}.${key}`, rulesRecord);
      }
    });
  }
}

/**
 * Main function for matching files against schema rules
 * Attempts to find appropriate rules for each file based on various criteria
 * @param schema - The schema containing rules
 * @param context - Context containing file information
 * @returns Promise that resolves when matching is complete
 */
function findRuleMatches(schema, context) {
  const schemaPath = "rules.files";
  Object.keys(schema[schemaPath]).map((key) => {
    const path = `${schemaPath}.${key}`;
    _findRuleMatches(schema[path], path, context);
  });

  if (
    context.filenameRules.length === 0 &&
    context.file.path !== "/.bidsignore"
  ) {
    // Handle files not matching any rules
    context.issues.addSchemaIssue("FileNotChecked", [context.file]);
    if (context.file.name === "dataset_description.json") {
      context.issues.addSchemaIssue(
        "WrongMetadataLocation",
        [context.file],
        `You have placed a file called "dataset_description.json" within the ${context.baseDir} 
        subDirectory. Such files are only valid when placed in the root directory.`,
      );
    }
  }
  return Promise.resolve();
}

/**
 * Tests if a file matches specific file rule criteria
 * @param arbitraryNesting - Whether subdirectories are allowed
 * @param hasSuffix - Whether to match by suffix or stem
 * @param node - Schema node containing rule
 * @param context - Context containing file info
 * @returns boolean indicating if file matches rule criteria
 */
function checkFileRules(
  arbitraryNesting: boolean,
  hasSuffix: boolean,
  node,
  context,
) {
  let baseDirCond: boolean = null;
  let suffixStemCond: boolean = null;

  // Handle directory nesting rules
  if (arbitraryNesting) {
    baseDirCond = context.baseDir === node.baseDir;
  } else {
    if (context.baseDir === "/") {
      baseDirCond = context.path === `/${context.file.name}`;
    } else {
      baseDirCond = context.path === `/${node.baseDir}/${context.file.name}`;
    }
  }

  // Match either by suffix or stem
  if (hasSuffix) {
    suffixStemCond = context.suffix === node.suffix;
  } else {
    suffixStemCond = context.file.name.startsWith(node.stem);
  }

  return (
    baseDirCond &&
    node.extensions.includes(context.extension) &&
    suffixStemCond
  );
}

/**
 * Recursive helper for matching files against schema rules
 * @param node - Current schema node being examined
 * @param path - Path to current node in schema
 * @param context - Context containing file information
 */
export function _findRuleMatches(node, path, context) {
  if ("arbitraryNesting" in node) {
    if (
      checkFileRules(node.arbitraryNesting, "suffix" in node, node, context)
    ) {
      context.filenameRules.push(path);
      return;
    }
  } else {
    Object.keys(node).map((key) => {
      if (
        typeof node[key] === "object"
      ) {
        _findRuleMatches(node[key], `${path}.${key}`, context);
      }
    });
  }
}
