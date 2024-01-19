/*
 * filenameIdentify.ts attempts to determine which schema rules from
 * `schema.rules.files` might apply to a given file context by looking at the
 * files suffix then its location in the directory hierarchy, and finally at
 * its extensions and entities. Ideally we end up with a single rule to
 * validate against. We try to take as broad an approach to finding a single
 * file rule as possible to generate the most possible errors for incorrectly
 * named files. Historically a regex was applied that was pass/fail with
 * little in the way of feed back. This way we can say hey you got the suffix
 * correct, but the directory is slightly off, or some entities are missing,
 * or too many are there for this rule. All while being able to point at an
 * object in the schema for reference.
 */
// @ts-nocheck: untyped functions
import { GenericSchema } from '../types/schema.ts'
import { CheckFunction } from '../types/check.ts'

const CHECKS: CheckFunction[] = [
  findRuleMatches
]

export async function filenameIdentify(schema, context) {
  for (const check of CHECKS) {
    await check(schema as unknown as GenericSchema, context)
  }
}

export function checkDirRules(schema,rulesRecord,baseDirs) {
    Object.keys(rulesRecord)
    .filter((key) => {
        return (key.startsWith('rules.files.common.core') &&
        !rulesRecord[key])
    })
    .map((key) => {
        const node = schema[key]
        if (node.directory === true && 
            baseDirs.includes(node.path)
            )
            rulesRecord[key] = true
            
      })
}

/* In order to check for the abscence of files in addition to their validity, we
 * need to keep a persistent rulesRecord object that contains all the file rules 
 * from the schema, so we can record which rules were satisfied by a file and which weren't
 */
export function findFileRules(schema,rulesRecord) {
    const schemaPath = 'rules.files'
    
    Object.keys(schema[schemaPath]).map((key) => {
        const path = `${schemaPath}.${key}`
        _findFileRules(schema[path], path,rulesRecord)
      })



    
    return Promise.resolve()
}

export function _findFileRules(node, path,rulesRecord) {
    if (
      ('path' in node) ||
      ('stem' in node) ||
      (('baseDir' in node) &&
      ('extensions' in node) &&
      ('suffix'))
    ) {
      rulesRecord[path] = false
      return
    }
    else {
      Object.keys(node).map((key) => {
        if(
          typeof node[key] === 'object'
        ){
          _findFileRules(node[key], `${path}.${key}`, rulesRecord)
        }
      })
    }
  }

function findRuleMatches(schema, context) {
  const schemaPath = 'rules.files'
  Object.keys(schema[schemaPath]).map((key) => {
    const path = `${schemaPath}.${key}`
    _findRuleMatches(schema[path], path, context)
  })
  if (
    context.filenameRules.length === 0 &&
    context.file.path !== '/.bidsignore'
  ) {
    context.issues.addNonSchemaIssue('NOT_INCLUDED', [context.file])

    if(context.file.path === "dataset_description.json"){
      context.issues.addNonSchemaIssue(
        "WRONG_METADATA_LOCATION",
        [context.file],
        `You have placed a file called "dataset_description.json" within the ${context.baseDir} 
        subDirectory. Such files are only valid when placed in the root directory.`
      )
    }
  }
  return Promise.resolve()
}

/* Schema rules specifying valid filenames follow a variety of patterns.
 * 'path', 'stem' or 'suffixies' contain the most unique identifying
 * information for a rule. We don't know what kind of filename the context is,
 * so if one of these three match the respective value in the context lets
 * assume that this schema rule is applicable to this file.
 */
export function _findRuleMatches(node, path, context) {
  if (
    ('path' in node && context.file.name.endsWith(node.path)) ||
    ('stem' in node && context.file.name.startsWith(node.stem)) ||
    ((('baseDir' in node && 'arbitraryNesting' in node && node.arbitraryNesting && context.baseDir === node.baseDir) ||
    ('baseDir' in node && 'arbitraryNesting' in node && !node.arbitraryNesting && context.path === `/${node.baseDir}/${context.file.name}`)) &&
    ('extensions' in node && node.extensions.includes(context.extension)) &&
    ('suffix' in node && context.suffix === node.suffix))
  ) {
    context.filenameRules.push(path)
    return
  }
  if (
    !('path' in node || 'stem' in node || 'baseDir' in node || 'extensions' in node || 'suffix' in node)
  ) {
    Object.keys(node).map((key) => {
      if(
        typeof node[key] === 'object'
      ){
        _findRuleMatches(node[key], `${path}.${key}`, context)
      }
    })
  }
}
