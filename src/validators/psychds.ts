import { emptyFile } from './internal/emptyFile.ts'
import { filenameIdentify,findFileRules, checkDirRules } from './filenameIdentify.ts'
import { filenameValidate, checkMissingRules } from './filenameValidate.ts'
import { applyRules } from '../schema/applyRules.ts'
import { CheckFunction } from '../types/check.ts'
import { FileTree } from '../types/filetree.ts'
import { ValidatorOptions } from '../setup/options.ts'
import { ValidationResult } from '../types/validation-result.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import { Summary } from '../summary/summary.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { psychDSFile } from '../types/file.ts'
import { psychDSContextDataset } from '../schema/context.ts'
import { walkFileTree } from '../schema/walk.ts'
import { GenericSchema } from '../types/schema.ts'


const CHECKS: CheckFunction[] = [
    emptyFile,
    filenameIdentify,
    filenameValidate,
    applyRules,
  ]

/**
 * Full psych-DS schema validation entrypoint
 */
export async function validate(
  fileTree: FileTree,
  options: ValidatorOptions,
): Promise<ValidationResult> {
  const issues = new DatasetIssues()
  const summary = new Summary()
  const schema = await loadSchema(options.schema)
  summary.schemaVersion = schema.schema_version
  
  /* There should be a dataset_description in root, this will tell us if we
   * are dealing with a derivative dataset
   */
  const ddFile = fileTree.files.find(
    (file: psychDSFile) => file.name === 'dataset_description.json',
  )

  let dsContext
  if (ddFile) {
    try{
      const description = await ddFile.text().then((text) => JSON.parse(text))
      dsContext = new psychDSContextDataset(options, description)
    }
    catch(_error){
      dsContext = new psychDSContextDataset(options)
      issues.addNonSchemaIssue(
        'INVALID_JSON_FORMATTING',
        [ddFile]
      )
    }
  
  } else {
    dsContext = new psychDSContextDataset(options)
  }

  // generate rulesRecord object to keep track of which schema rules 
  // are not satisfied by a file in the dataset.
  const rulesRecord: Record<string,boolean> = {}
  findFileRules(schema,rulesRecord)

  for await (const context of walkFileTree(fileTree, issues, dsContext)) {
    // TODO - Skip ignored files for now (some tests may reference ignored files)
    if (context.file.ignored) {
      continue
    }
    await context.asyncLoads()
    if(context.extension === ".csv"){
        summary.suggestedColumns  = [...new Set([...summary.suggestedColumns,...Object.keys(context.columns)])]
    }
        
    // Run majority of checks
    for (const check of CHECKS) {
      // TODO - Resolve this double casting?
      await check(schema as unknown as GenericSchema, context)
    }

    for (const rule of context.filenameRules) {
        rulesRecord[rule] = true
    }

    await summary.update(context)
  }

  // Since directories don't get their own psychDS context, any directories found
  // within the root directory are added the psychDSContextDataset's baseDirs property.
  // Since these won't show up in the filetree exploration as files eligible to apply rules to,
  // we need to check them explicitly.
  checkDirRules(schema,rulesRecord,dsContext.baseDirs)
  checkMissingRules(schema as unknown as GenericSchema,rulesRecord,issues)

  const output: ValidationResult = {
    valid: [...issues.values()].filter(issue => issue.severity === "error").length === 0,
    issues,
    summary: summary.formatOutput(),
  }
  return output
}