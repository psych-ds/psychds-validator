import { CheckFunction, RuleCheckFunction } from '../types/check.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { psychDSContext } from '../schema/context.ts'
import { GenericSchema, Schema, Format } from '../types/schema.ts'
import { SEP } from '../deps/path.ts'
import { hasProp } from '../utils/objectPathHandler.ts'
import { Severity } from '../types/issues.ts'

const sidecarExtensions = ['.json']

const CHECKS: CheckFunction[] = [
  atRoot,
  checkRules,
]

export async function filenameValidate(
  schema: GenericSchema,
  context: psychDSContext,
) {
  for (const check of CHECKS) {
    await check(schema, context)
  }
  return Promise.resolve()
}

export function isAtRoot(context: psychDSContext) {
  if (context.file.path.split(SEP).length !== 2) {
    return false
  }
  return true
}


export function atRoot(schema: GenericSchema, context: psychDSContext) {
  /*
  if (fileIsAtRoot && !sidecarExtensions.includes(context.extension)) {
    // create issue for data file in root of dataset
  }
  */
  return Promise.resolve()
}


const ruleChecks: RuleCheckFunction[] = [
  extensionMismatch,
]

export async function checkRules(schema: GenericSchema, context: psychDSContext) {
  if (context.filenameRules.length === 1) {
    for (const check of ruleChecks) {
      check(
        context.filenameRules[0],
        schema as unknown as GenericSchema,
        context,
      )
    }
  } else {
    const ogIssues = context.issues
    const noIssues: [string, DatasetIssues][] = []
    const someIssues: [string, DatasetIssues][] = []
    for (const path of context.filenameRules) {
      const tempIssues = new DatasetIssues()
      context.issues = tempIssues
      for (const check of ruleChecks) {
        check(path, schema as unknown as GenericSchema, context)
      }
      tempIssues.size
        ? someIssues.push([path, tempIssues])
        : noIssues.push([path, tempIssues])
    }
    if (noIssues.length) {
      context.issues = ogIssues
      context.filenameRules = [noIssues[0][0]]
    } else if (someIssues.length) {
      // What would we want to do with each rules issues? Add all?
      context.issues = ogIssues
      context.issues.addNonSchemaIssue('ALL_FILENAME_RULES_HAVE_ISSUES', [
        {
          ...context.file,
          evidence: `Rules that matched with issues: ${someIssues
            .map((x) => x[0])
            .join(', ')}`,
        },
      ])
    }
  }
  return Promise.resolve()
}

export async function extensionMismatch(
  path: string,
  schema: GenericSchema,
  context: psychDSContext,
) {
  const rule = schema[path]
  if (
    Array.isArray(rule.extensions) &&
    !rule.extensions.includes(context.extension)
  ) {
    context.issues.addNonSchemaIssue('EXTENSION_MISMATCH', [
      { ...context.file, evidence: `Rule: ${path}` },
    ])
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
    rulesRecord: Record<string,boolean>,
    issues: DatasetIssues
) {
    Object.keys(rulesRecord)
        .filter((key) => {return rulesRecord[key] === false})
        .map((key) => {
            const node = schema[key]
            issues.add({
                key:node.code as string,
                reason:node.reason as string,
                severity:node.level as Severity
            })

      })
}