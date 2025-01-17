/**
 * @fileoverview Handles schema rule application and validation for Psych-DS files.
 * Provides functionality for evaluating rules against files, validating JSON-LD metadata,
 * and checking schema.org compliance.
 */

import {
  GenericRule,
  GenericRuleOrg,
  GenericSchema,
  SchemaFields,
  SchemaOrgIssues,
} from "../types/schema.ts";
import { Severity } from "../types/issues.ts";
import { psychDSContext } from "./context.ts";
import { memoize } from "../utils/memoize.ts";
import { psychDSFile } from "../types/file.ts";

/**
 * Recursively applies schema rules to a given context.
 * Traverses schema object to find and evaluate applicable rules.
 *
 * @param schema - Schema containing rules to apply
 * @param context - Validation context
 * @param rootSchema - Original complete schema (used in recursion)
 * @param schemaPath - Current path in schema (used in recursion)
 * @returns Promise that resolves when all rules are applied
 */
export function applyRules(
  schema: GenericSchema,
  context: psychDSContext,
  rootSchema?: GenericSchema,
  schemaPath?: string,
) {
  if (!rootSchema) {
    rootSchema = schema;
  }
  if (!schemaPath) {
    schemaPath = "schema";
  }
  for (const key in schema) {
    if (!(schema[key].constructor === Object)) {
      continue;
    }
    if ("selectors" in schema[key]) {
      evalRule(
        schema[key] as GenericRule,
        context,
        rootSchema,
        `${schemaPath}.${key}`,
      );
    } else if (schema[key].constructor === Object) {
      applyRules(
        schema[key] as GenericSchema,
        context,
        rootSchema,
        `${schemaPath}.${key}`,
      );
    }
  }
  return Promise.resolve();
}

/**
 * Creates a function to safely evaluate selectors in context
 * @param src - Source string to evaluate
 * @returns Function that evaluates source in context
 */
// deno-lint-ignore ban-types
const evalConstructor = (src: string): Function =>
  new Function("context", `with (context) { return ${src} }`);

/** Safe property access handler */
const safeHas = () => true;

/**
 * Safe property getter that handles symbols
 */
// deno-lint-ignore no-explicit-any
const safeGet = (target: any, prop: any) =>
  prop === Symbol.unscopables ? undefined : target[prop];

/** Memoized version of evalConstructor for performance */
const memoizedEvalConstructor = memoize(evalConstructor);

/**
 * Safely evaluates a selector string in a given context
 * @param src - Selector string to evaluate
 * @param context - Context to evaluate in
 * @returns Result of evaluation
 */
export function evalCheck(src: string, context: psychDSContext) {
  const test = memoizedEvalConstructor(src);
  const safeContext = new Proxy(context, { has: safeHas, get: safeGet });
  try {
    return test(safeContext);
  } catch (_error) {
    return false;
  }
}

/**
 * Maps rule types to their evaluation functions
 * Each function handles a different type of rule validation
 */
// @ts-expect-error: most props not needed
const evalMap: Record<
  keyof GenericRule,
  (
    rule: GenericRule,
    context: psychDSContext,
    schema: GenericSchema,
    schemaPath: string,
  ) => boolean | void | Promise<void>
> = {
  columnsMatchMetadata: evalColumns,
  fields: evalJsonCheck,
};

/**
 * Evaluates a single rule against a context
 * Checks selectors and applies appropriate evaluation functions
 *
 * @param rule - Rule to evaluate
 * @param context - Context to evaluate against
 * @param schema - Complete schema
 * @param schemaPath - Path to current rule in schema
 */
function evalRule(
  rule: GenericRule,
  context: psychDSContext,
  schema: GenericSchema,
  schemaPath: string,
) {
  if (rule.selectors && !mapEvalCheck(rule.selectors, context)) {
    return;
  }
  Object.keys(rule)
    .filter((key) => key in evalMap)
    .map((key) => {
      //@ts-expect-error: most props not needed
      evalMap[key](rule, context, schema, schemaPath);
    });
}

/**
 * Evaluates multiple selector statements against context
 * @param statements - Array of selector statements
 * @param context - Context to evaluate against
 * @returns True if all statements evaluate to true
 */
function mapEvalCheck(statements: string[], context: psychDSContext): boolean {
  return statements.every((x) => evalCheck(x, context));
}

/**
 * Validates that CSV columns match metadata definitions
 * Checks column headers against variableMeasured metadata
 * Also performs schema.org validation on metadata
 *
 * @param _rule - Rule being evaluated
 * @param context - Current validation context
 * @param schema - Complete schema
 * @param schemaPath - Path to current rule
 */
function evalColumns(
  _rule: GenericRule,
  context: psychDSContext,
  schema: GenericSchema,
  schemaPath: string,
): void {
  if (context.extension !== ".csv") return;
  const headers = [...Object.keys(context.columns)];
  let invalidHeaders: string[] = [];
  for (const header of headers) {
    if (!(context.validColumns.includes(header))) {
      invalidHeaders = [...invalidHeaders, header];
    }
  }
  if (invalidHeaders.length != 0) {
    context.issues.addSchemaIssue("CsvColumnMissingFromMetadata", [
      {
        ...context.file,
        evidence:
          `Column headers: [${invalidHeaders}] do not appear in variableMeasured. ${schemaPath}`,
      },
    ]);
  }

  // Track issues by type for aggregated reporting
  const schemaOrgIssues = {
    "termIssues": [] as string[],
    "unknownNamespaceIssues": [] as string[],
    "typeIssues": [] as string[],
    "typeMissingIssues": [] as string[],
  } as SchemaOrgIssues;

  schemaCheck(context, schema, schemaOrgIssues);
}

/**
 * Validates required fields in JSON metadata
 * Checks both field presence and schema.org validity
 *
 * @param rule - Rule containing field requirements
 * @param context - Current validation context
 * @param _schema - Complete schema
 * @param schemaPath - Path to current rule
 */
function evalJsonCheck(
  rule: GenericRule,
  context: psychDSContext,
  _schema: GenericSchema,
  schemaPath: string,
) {
  const issueKeys: string[] = [];

  // Check each required field
  for (const [key, requirement] of Object.entries(rule.fields)) {
    const severity = getFieldSeverity(requirement, context);
    const keyName = `http://schema.org/${key}`;

    if (
      severity && severity !== "ignore" && !(keyName in context.expandedSidecar)
    ) {
      if (requirement.issue?.code && requirement.issue?.message) {
        context.issues.add({
          key: requirement.issue.code,
          reason: requirement.issue.message,
          severity,
          files: [{ ...context.file }],
        });
      } else {
        issueKeys.push(key);
      }
    }
  }

  if (issueKeys.length != 0) {
    context.issues.addSchemaIssue("JsonKeyRequired", [
      {
        ...context.file,
        evidence:
          `metadata object missing fields: [${issueKeys}] as per ${schemaPath}. 
                    If these fields appear to be present in your metadata, then there may be an issue with your schema.org context`,
      },
    ]);
  }
}

/**
 * Validates schema.org metadata compliance
 * Checks type requirements for root object and recursively validates sub-objects
 *
 * @param context - Current validation context
 * @param schema - Complete schema
 * @param issues - Collection of validation issues
 */
function schemaCheck(
  context: psychDSContext,
  schema: GenericSchema,
  issues: SchemaOrgIssues,
) {
  const schemaNamespace = "http://schema.org/";

  if ("@type" in context.expandedSidecar) {
    if (
      (context.expandedSidecar["@type"] as string[])[0] !==
        `${schemaNamespace}Dataset`
    ) {
      let issueFile: psychDSFile;
      if (Object.keys(context.metadataProvenance).includes("@type")) {
        issueFile = context.metadataProvenance["@type"];
      } else {
        issueFile = context.dataset.metadataFile;
      }
      context.issues.addSchemaIssue("IncorrectDatasetType", [
        {
          ...issueFile,
          evidence:
            `dataset_description.json's "@type" property must have "Dataset" as its value.
                      additionally, the term "Dataset" must implicitly or explicitly use the schema.org namespace.
                      The schema.org namespace can be explicitly set using the "@context" key`,
        },
      ]);
      return;
    }
  } else {
    context.issues.addSchemaIssue("MissingDatasetType", [
      {
        ...context.file,
        evidence:
          `dataset_description.json must have either the "@type" or the "type" property.`,
      },
    ]);
    return;
  }

  issues = _schemaCheck(
    context.expandedSidecar,
    context,
    schema,
    "",
    schemaNamespace,
    issues,
  );
  logSchemaIssues(context, issues);
}

/**
 * Records collected schema.org validation issues
 * Groups issues by type and adds them to context
 *
 * @param context - Current validation context
 * @param issues - Collected validation issues
 */
function logSchemaIssues(
  context: psychDSContext,
  issues: SchemaOrgIssues,
) {
  // Handle invalid term issues
  if (issues.termIssues.length != 0) {
    issues.termIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile: psychDSFile;
      if (Object.keys(context.metadataProvenance).includes(rootKey)) {
        issueFile = context.metadataProvenance[rootKey];
      } else {
        issueFile = context.dataset.metadataFile;
      }

      context.issues.addSchemaIssue("InvalidSchemaorgProperty", [
        {
          ...issueFile,
          evidence:
            `This file contains one or more keys that use the schema.org namespace, but are not  official schema.org properties.
                      According to the psych-DS specification, this is not an error, but be advised that these terms will not be
                      machine-interpretable and do not function as linked data elements. These are the keys in question: [${issues.termIssues}]`,
        },
      ]);
    });
  }

  // Handle invalid type issues
  if (issues.typeIssues.length != 0) {
    issues.typeIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile: psychDSFile;
      if (rootKey in context.metadataProvenance) {
        issueFile = context.metadataProvenance[rootKey];
      } else {
        issueFile = context.dataset.metadataFile;
      }

      context.issues.addSchemaIssue("InvalidObjectType", [
        {
          ...issueFile,
          evidence:
            `This file contains one or more objects with types that do not match the selectional constraints of their keys.
                        Each schema.org property (which take the form of keys in your metadata json) has a specific range of types
                        that can be used as its value. Type constraints for a given property can be found by visiting their corresponding schema.org
                        URL. All properties can take strings or URLS as objects, under the assumption that the string/URL represents a unique ID.
                        Type selection errors occured at the following locations in your json structure: [${issues.typeIssues}]`,
        },
      ]);
    });
  }

  // Handle missing type issues
  if (issues.typeMissingIssues.length != 0) {
    issues.typeMissingIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile: psychDSFile;
      if (Object.keys(context.metadataProvenance).includes(rootKey)) {
        issueFile = context.metadataProvenance[rootKey];
      } else {
        issueFile = context.dataset.metadataFile;
      }

      context.issues.addSchemaIssue("ObjectTypeMissing", [
        {
          ...issueFile,
          evidence:
            `This file contains one or more objects without a @type property. Make sure that any object that you include
                      as the value of a schema.org property contains a valid schema.org @type, unless it is functioning as some kind of 
                      base type, such as Text or URL, containing a @value key. @type is optional, but not required on such objects.
                      The following objects without @type were found: [${issues.typeMissingIssues}]`,
        },
      ]);
    });
  }

  // Handle unknown namespace issues
  if (issues.unknownNamespaceIssues.length != 0) {
    issues.unknownNamespaceIssues.forEach((issue) => {
      const rootKey = issue.split(".")[0];
      let issueFile: psychDSFile;
      if (Object.keys(context.metadataProvenance).includes(rootKey)) {
        issueFile = context.metadataProvenance[rootKey];
      } else {
        issueFile = context.dataset.metadataFile;
      }

      context.issues.addSchemaIssue("UnknownNamespace", [
        {
          ...issueFile,
          evidence:
            `This file contains one or more references to namespaces other than https://schema.org:
                      [${issues.unknownNamespaceIssues}].`,
        },
      ]);
    });
  }
}

/**
 * Recursively validates schema.org metadata structure
 * Checks each node for proper typing and property usage
 *
 * @param node - Current node being validated
 * @param context - Validation context
 * @param schema - Complete schema
 * @param objectPath - Path to current node
 * @param nameSpace - Schema.org namespace
 * @param issues - Collection of validation issues
 * @returns Updated collection of validation issues
 */
function _schemaCheck(
  node: object,
  context: psychDSContext,
  schema: GenericSchema,
  objectPath: string,
  nameSpace: string,
  issues: SchemaOrgIssues,
): SchemaOrgIssues {
  let superClassSlots: string[] = [];
  let thisType = "";
  if ("@type" in node) {
    thisType = (node["@type"] as string[])[0];
    superClassSlots = getSuperClassSlots(
      thisType,
      schema,
      nameSpace,
    ) as string[];
  }

  // Process each property in the node
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@")) {
      continue;
    } else {
      // Check namespace usage
      if (!key.startsWith(nameSpace)) {
        issues.unknownNamespaceIssues.push(key);
        continue;
      } else {
        const property = key.replace(nameSpace, "");
        let range: string[] = [];
        // Validate property against schema
        if (property in schema[`schemaOrg.slots`]) {
          // Handle single range
          if ("range" in schema[`schemaOrg.slots.${property}`]) {
            range.push(schema[`schemaOrg.slots.${property}.range`] as string);
            range = range.concat(
              getSubClassSlots(
                schema[`schemaOrg.slots.${property}.range`] as string,
                schema,
                nameSpace,
              ),
            );
          }
          // Handle multiple ranges
          if ("any_of" in schema[`schemaOrg.slots.${property}`]) {
            for (
              const ran
                of (schema[`schemaOrg.slots.${property}`] as GenericRuleOrg)
                  .any_of as object[]
            ) {
              if ("range" in ran) {
                range.push(ran.range as string);
                range = range.concat(
                  getSubClassSlots(ran.range as string, schema, nameSpace),
                );
              }
            }
          }
        }

        let subKeys: string[] = [];
        // Check if property is valid for the current type
        if (!(superClassSlots.includes(property))) {
          issues.termIssues.push(`${objectPath}.${property}`);
        } else {
          // Process property values
          for (let i = 0; i < value.length; i++) {
            const obj = value[i];
            subKeys = Object.keys(obj);
            if (
              !(subKeys.length === 1 &&
                (subKeys.includes("@id") || subKeys.includes("@value")))
            ) {
              if (subKeys.includes("@type")) {
                const objType = (Array.isArray(obj["@type"]))
                  ? obj["@type"][0].replace(nameSpace, "")
                  : obj["@type"].replace(nameSpace, "");
                if (![...range, "Text", "URL"].includes(objType)) {
                  issues.typeIssues.push(
                    `${objectPath}.${property}${i === 0 ? "" : `[${i}]`}`,
                  );
                }
                // Recursive validation of nested objects
                issues = _schemaCheck(
                  obj,
                  context,
                  schema,
                  `${objectPath}.${property}`,
                  nameSpace,
                  issues,
                );
              } else {
                issues.typeMissingIssues.push(
                  `${objectPath}.${property}${i === 0 ? "" : `[${i}]`}`,
                );
              }
            }
          }
        }
      }
    }
  }
  return issues;
}

/**
 * Recursively collects valid property slots from type hierarchy
 * Traverses up the schema.org class hierarchy to gather all applicable properties
 *
 * @param type - Current type being processed
 * @param schema - Complete schema
 * @param nameSpace - Schema.org namespace
 * @returns Array of valid property names
 */
function getSuperClassSlots(
    type: string,
    schema: GenericSchema,
    nameSpace: string
  ): string[]{
    
    type = type.replace(nameSpace,"")

    if (!(type in schema['schemaOrg.classes'])) {
      return []
    }

    //if type has a super class, append this type's slots to the result of this function for super class
    const slots = schema[`schemaOrg.classes.${type}.slots`] as string[] || []
    const is_a = 'is_a' in schema[`schemaOrg.classes.${type}`] ? getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`] as string, schema, nameSpace) : []

    return [...slots, ...is_a];
 }

/**
 * Recursively collects subclass types that are valid for a property
 * Finds all types that could be valid values for a property
 *
 * @param type - Base type to find subclasses for
 * @param schema - Complete schema
 * @param nameSpace - Schema.org namespace
 * @returns Array of valid subclass type names
 */
function getSubClassSlots(
  type: string,
  schema: GenericSchema,
  nameSpace: string,
): string[] {
  const subClasses: string[] = [];
  if (type.includes(nameSpace)) {
    type = type.replace(nameSpace, "");
  }
  if (type in schema[`schemaOrg.classes`]) {
    for (const [key, value] of Object.entries(schema["schemaOrg.classes"])) {
      if ("is_a" in value && value["is_a"] === type) {
        subClasses.push(key);
        subClasses.concat(getSubClassSlots(key, schema, nameSpace));
      }
    }
    return subClasses;
  } else {
    return [];
  }
}

/**
 * Determines the severity level for a JSON field requirement
 * Handles conditional requirements based on other field values
 *
 * @param requirement - Requirement specification
 * @param context - Current validation context
 * @returns Appropriate severity level for the requirement
 */
function getFieldSeverity(
  requirement: string | SchemaFields,
  context: psychDSContext,
): Severity {
  const levelToSeverity: Record<string, Severity> = {
    recommended: "ignore",
    required: "error",
    optional: "ignore",
    prohibited: "ignore",
  };
  let severity: Severity = "ignore";

  if (typeof requirement === "string" && requirement in levelToSeverity) {
    severity = levelToSeverity[requirement];
  } else if (typeof requirement === "object" && requirement.level) {
    severity = levelToSeverity[requirement.level];
    const addendumRegex = /(required|recommended) if \`(\w+)\` is \`(\w+)\`/;
    if (requirement.level_addendum) {
      const match = addendumRegex.exec(requirement.level_addendum);
      if (match && match.length === 4) {
        const [_, addendumLevel, key, value] = match;
        if (
          key in context.sidecar &&
          (context.sidecar as Record<string, unknown>)[key] === value
        ) {
          severity = levelToSeverity[addendumLevel];
        }
      }
    }
  }
  return severity;
}
