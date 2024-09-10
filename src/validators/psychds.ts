import { emptyFile } from './internal/emptyFile.ts'
import { filenameIdentify,findFileRules, checkDirRules } from './filenameIdentify.ts'
import { filenameValidate, checkMissingRules } from './filenameValidate.ts'
import { applyRules } from '../schema/applyRules.ts'
import { CheckFunction } from '../types/check.ts'
import { FileTree } from '../types/filetree.ts'
import { ValidatorOptions } from '../setup/options.ts'
import { ValidationResult } from '../types/validation-result.ts'
import { DatasetIssues } from '../issues/datasetIssues.ts'
import {
  IssueFile
} from '../types/issues.ts'
import { Summary } from '../summary/summary.ts'
import { loadSchema } from '../setup/loadSchema.ts'
import { psychDSFile } from '../types/file.ts'
import { psychDSContextDataset } from '../schema/context.ts'
import { walkFileTree } from '../schema/walk.ts'
import { GenericSchema } from '../types/schema.ts'
import { EventEmitter } from 'node:events';

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
  options: ValidatorOptions & { emitter?: EventEmitter },
): Promise<ValidationResult> {

  // Emitter event: Signals the start of the validation process
  options.emitter?.emit('start', { success: true })

  const summary = new Summary()
  const schema = await loadSchema(options.schema)
  const issues = new DatasetIssues(schema as unknown as GenericSchema)

  // Emitter event: Signals that the file tree has been successfully built
  options.emitter?.emit('build-tree', { success: true })

  summary.schemaVersion = schema.schema_version
  
  /* There should be a dataset_description in root, this will tell us if we
   * are dealing with a derivative dataset
   */
  const ddFile = fileTree.files.find(
    (file: psychDSFile) => file.path === '/dataset_description.json',
  )

  let dsContext
  if (ddFile) {
    // Emitter event: Signals that the metadata file has been found
    options.emitter?.emit('find-metadata', { success: true } )
    try{
      const description = await ddFile.text()
        .then(JSON.parse)
      
      dsContext = new psychDSContextDataset(options, ddFile,description)
    }
    catch(_error){
      dsContext = new psychDSContextDataset(options,ddFile)
      issues.addSchemaIssue(
        'InvalidJsonFormatting',
        [ddFile]
      )
      // Emitter event: Signals that there was an error parsing the metadata JSON
      options.emitter?.emit('metadata-json', { success: false, issue: issues.get('INVALID_JSON_FORMATTING') } )
    }
  
  } else {
    dsContext = new psychDSContextDataset(options)
  }

  // generate rulesRecord object to keep track of which schema rules 
  // are not satisfied by a file in the dataset.
  const rulesRecord: Record<string,boolean> = {}
  findFileRules(schema,rulesRecord)

  /**
   * Emits a check event based on the presence of specific issues.
   * 
   * @param event_name - The name of the event to emit.
   * @param issue_keys - An array of issue keys to check for.
   * 
   * This function checks if any of the specified issues exist. If they do, it emits
   * the event with a failure status and the first found issue. Otherwise, it emits
   * a success status.
   */
  const emitCheck = (event_name: string, issue_keys: string[]) => {
    const fails = issue_keys.filter((issue) => issues.hasIssue({key:issue}))

    options.emitter?.emit(event_name, fails.length > 0 ? 
      { success: false, issue: issues.get(fails[0]) } :
      { success: true }
    )
  }

  for await (const context of walkFileTree(fileTree, issues, dsContext)) {
    if (dsContext.baseDirs.includes('/data'))
      // Emitter event: Signals that the data directory has been found
      options.emitter?.emit('find-data-dir', { success: true } )

    // json-ld processing is now done in the readFileTree stage,
    // so there may be some issues (like json-ld grammar errors)
    // that are discovered before the issue object is created.
    // Check all files found for any of these issues and add them.
    if (context.file.issueInfo.length > 0){
      context.file.issueInfo.forEach((iss) => {
        issues.addSchemaIssue(
          iss.key,
          [{
            ...context.file,
            evidence: iss.evidence ? iss.evidence : ''
            } as IssueFile]
          
        )
      })
    }
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

    if (context.extension === '.csv' && context.suffix === 'data'){
      // Emitter events: Signal various metadata checks
      options.emitter?.emit('metadata-utf8', { success: true } )
      emitCheck('metadata-json',['INVALID_JSON_FORMATTING'])
      emitCheck('metadata-fields',['JSON_KEY_REQUIRED'])
      emitCheck('metadata-jsonld',['INVALID_JSONLD_FORMATTING'])
      emitCheck('metadata-type',['INCORRECT_DATASET_TYPE','MISSING_DATASET_TYPE'])
      emitCheck('metadata-schemaorg',['INVALID_SCHEMAORG_PROPERTY','INVALID_OBJECT_TYPE','OBJECT_TYPE_MISSING'])
      options.emitter?.emit('check-for-csv', { success: true } )
    }
  }

  // Emitter events: Signal various CSV checks
  emitCheck('csv-keywords',['KEYWORD_FORMATTING_ERROR','UNOFFICIAL_KEYWORD_ERROR'])
  emitCheck('csv-parse',['CSV_FORMATTING_ERROR'])
  emitCheck('csv-header',['NO_HEADER'])
  emitCheck('csv-nomismatch',['HEADER_ROW_MISMATCH'])
  emitCheck('csv-rowid',['ROWID_VALUES_NOT_UNIQUE'])
  emitCheck('check-variableMeasured',['CSV_COLUMN_MISSING'])

  // Since directories don't get their own psychDS context, any directories found
  // within the root directory are added the psychDSContextDataset's baseDirs property.
  // Since these won't show up in the filetree exploration as files eligible to apply rules to,
  // we need to check them explicitly.
  checkDirRules(schema,rulesRecord,dsContext.baseDirs)
  checkMissingRules(schema as unknown as GenericSchema,rulesRecord,issues)

  // Emitter events: Final checks for metadata and data directory
  emitCheck('find-metadata',['MISSING_DATASET_DESCRIPTION'])
  emitCheck('find-data-dir', ['MISSING_DATA_DIRECTORY'])

  //filters out issues that apply to unfound objects
  issues.filterIssues(rulesRecord)

  const output: ValidationResult = {
    valid: [...issues.values()].filter(issue => issue.severity === "error").length === 0,
    issues,
    summary: summary.formatOutput(),
  }
  return output
}