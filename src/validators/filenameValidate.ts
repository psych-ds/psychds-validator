import { CheckFunction, RuleCheckFunction } from "../types/check.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";
import { psychDSContext } from "../schema/context.ts";
import { GenericRule, GenericSchema } from "../types/schema.ts";
import { sep } from "node:path";
import { Severity } from "../types/issues.ts";

const CHECKS: CheckFunction[] = [
  checkRules,
];

export async function filenameValidate(
  schema: GenericSchema,
  context: psychDSContext,
) {
  for (const check of CHECKS) {
    await check(schema, context);
  }
  return Promise.resolve();
}

export function isAtRoot(context: psychDSContext) {
  if (context.file.path.split(sep).length !== 2) {
    return false;
  }
  return true;
}

const ruleChecks: RuleCheckFunction[] = [
  extensionMismatch,
  keywordCheck,
];

export function checkRules(schema: GenericSchema, context: psychDSContext) {
  if (context.filenameRules.length === 1) {
    for (const check of ruleChecks) {
      check(
        context.filenameRules[0],
        schema as unknown as GenericSchema,
        context,
      );
    }
  } else {
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
      context.issues = ogIssues;
      context.filenameRules = [noIssues[0][0]];
    } else if (someIssues.length) {
      // What would we want to do with each rules issues? Add all?
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

/*
 * Function to evaluate filename for keyword formatting and log warnings/errors
 * about non-canonical keyword usage
 * params:
 * path: specific string location within the schema model
 * schema: schema model object
 * context: context objectfor this particular file within the file tree
 */
export function keywordCheck(
  path: string,
  schema: GenericSchema,
  context: psychDSContext,
) {
  const rule = schema[path];
  if ("usesKeywords" in rule && rule.usesKeywords) {
    if ("fileRegex" in rule) {
      const fileRegex = new RegExp(rule.fileRegex as unknown as string);
      const regexMatch = context.file.name.match(fileRegex);
      // If only a fraction of the filename or the whole filename is invalid according to regex
      // within the schema model, log error
      if ((regexMatch && regexMatch[0] !== context.file.name) || !regexMatch) {
        context.issues.addSchemaIssue(
          "KeywordFormattingError",
          [context.file],
        );
      }
    }
    //if any of the keywords are not part of the official list within the schema model
    if (
      !Object.keys(context.keywords).every((keyword) =>
        keyword in schema["meta.context.context.properties.keywords.properties"]
      )
    ) {
      //will be delivered either as warning or error depending on schema model configuration.
      context.issues.addSchemaIssue(
        "UnofficialKeywordWarning",
        [context.file],
      );
    }
  }
}

/* Checks the rulesRecord object to see which rules were satisfied (or at least detected)
 * and which weren't. Since there are no files in question to list for the files object,
 * it's necessary to use unique error codes for each missing type of element.
 * Error codes, severity levels, and error messages (reasons) are collated with each rule
 * in the schema model
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
