/**
 * @fileoverview Handles schema rule application and validation for Psych-DS files.
 * OPTIMIZED VERSION v3 - Added memoization and defensive null checks.
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

// ============== MEMOIZATION CACHES ==============
let superClassSlotsCache = new Map<string, string[]>();
let subClassSlotsCache = new Map<string, string[]>();

export function clearApplyRulesCaches() {
  superClassSlotsCache = new Map();
  subClassSlotsCache = new Map();
}

// ============== MAIN EXPORTS ==============

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

// ============== SELECTOR EVALUATION ==============

// deno-lint-ignore ban-types
const evalConstructor = (src: string): Function =>
  new Function("context", `with (context) { return ${src} }`);

const safeHas = () => true;

// deno-lint-ignore no-explicit-any
const safeGet = (target: any, prop: any) =>
  prop === Symbol.unscopables ? undefined : target[prop];

const memoizedEvalConstructor = memoize(evalConstructor);

export function evalCheck(src: string, context: psychDSContext) {
  const test = memoizedEvalConstructor(src);
  const safeContext = new Proxy(context, { has: safeHas, get: safeGet });
  try {
    return test(safeContext);
  } catch (_error) {
    return false;
  }
}

// ============== RULE EVALUATION ==============

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

function mapEvalCheck(statements: string[], context: psychDSContext): boolean {
  return statements.every((x) => evalCheck(x, context));
}

// ============== COLUMN VALIDATION ==============

function evalColumns(
  _rule: GenericRule,
  context: psychDSContext,
  schema: GenericSchema,
  schemaPath: string,
): void {
  if (context.extension !== ".csv") return;
  const headers = [...Object.keys(context.columns)];
  context.dataset.allColumns = [...new Set([...context.dataset.allColumns, ...headers])];
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

  const schemaOrgIssues = {
    "termIssues": [] as string[],
    "unknownNamespaceIssues": [] as string[],
    "typeIssues": [] as string[],
    "typeMissingIssues": [] as string[],
  } as SchemaOrgIssues;

  schemaCheck(context, schema, schemaOrgIssues);
}

// ============== JSON FIELD VALIDATION ==============

function evalJsonCheck(
  rule: GenericRule,
  context: psychDSContext,
  _schema: GenericSchema,
  schemaPath: string,
) {
  const issueKeys: string[] = [];

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

// ============== SCHEMA.ORG VALIDATION ==============

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

function logSchemaIssues(
  context: psychDSContext,
  issues: SchemaOrgIssues,
) {
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
            `This file contains one or more keys that use the schema.org namespace, but are not official schema.org properties.
            According to the psych-DS specification, this is not an error, but be advised that these terms will not be
            machine-interpretable and do not function as linked data elements. These are the keys in question: [${issues.termIssues}]`,
        },
      ]);
    });
  }

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
            Type selection errors occurred at the following locations in your json structure: [${issues.typeIssues}]`,
        },
      ]);
    });
  }

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

// ============== RECURSIVE SCHEMA CHECK ==============

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

  // Get slots object once, with null check
  const slotsObj = schema[`schemaOrg.slots`];

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@")) {
      continue;
    } else {
      if (!key.startsWith(nameSpace)) {
        issues.unknownNamespaceIssues.push(key);
        continue;
      } else {
        const property = key.replace(nameSpace, "");
        let range: string[] = [];
        
        // DEFENSIVE: Check slotsObj exists before using 'in' operator
        if (slotsObj && property in slotsObj) {
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
        if (!(superClassSlots.includes(property))) {
          issues.termIssues.push(`${objectPath}.${property}`);
        } else {
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

// ============== MEMOIZED SCHEMA HELPERS ==============

/**
 * MEMOIZED: Recursively collects valid property slots from type hierarchy
 */
function getSuperClassSlots(
  type: string,
  schema: GenericSchema,
  nameSpace: string
): string[] {
  type = type.replace(nameSpace, "");

  const cacheKey = `super:${type}`;
  if (superClassSlotsCache.has(cacheKey)) {
    return superClassSlotsCache.get(cacheKey)!;
  }

  // DEFENSIVE: Get classes object and check it exists
  const classesObj = schema['schemaOrg.classes'];
  if (!classesObj || !(type in classesObj)) {
    superClassSlotsCache.set(cacheKey, []);
    return [];
  }

  const slots = schema[`schemaOrg.classes.${type}.slots`] as string[] || [];
  const is_a = 'is_a' in schema[`schemaOrg.classes.${type}`] 
    ? getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`] as string, schema, nameSpace) 
    : [];

  const result = [...slots, ...is_a];
  superClassSlotsCache.set(cacheKey, result);
  return result;
}

/**
 * MEMOIZED: Recursively collects subclass types that are valid for a property
 * FIXED: Original bug where concat result was discarded
 */
function getSubClassSlots(
  type: string,
  schema: GenericSchema,
  nameSpace: string,
): string[] {
  if (type.includes(nameSpace)) {
    type = type.replace(nameSpace, "");
  }

  const cacheKey = `sub:${type}`;
  if (subClassSlotsCache.has(cacheKey)) {
    return subClassSlotsCache.get(cacheKey)!;
  }

  // DEFENSIVE: Get classes object and check it exists
  const classesObj = schema[`schemaOrg.classes`];
  if (!classesObj || !(type in classesObj)) {
    subClassSlotsCache.set(cacheKey, []);
    return [];
  }

  const subClasses: string[] = [];
  for (const [key, value] of Object.entries(classesObj)) {
    if ("is_a" in value && value["is_a"] === type) {
      subClasses.push(key);
      // FIXED: was subClasses.concat(...) which discards result
      subClasses.push(...getSubClassSlots(key, schema, nameSpace));
    }
  }

  subClassSlotsCache.set(cacheKey, subClasses);
  return subClasses;
}

// ============== FIELD SEVERITY ==============

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
