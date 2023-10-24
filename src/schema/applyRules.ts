import {
    GenericRule,
    GenericSchema,
    SchemaFields,
    SchemaTypeLike,
  } from '../types/schema.ts'
  import { Severity } from '../types/issues.ts'
  import { psychDSContext } from './context.ts'
  import { expressionFunctions } from './expressionLanguage.ts'
  import { logger } from '../utils/logger.ts'
  import { memoize } from '../utils/memoize.ts'
  
  /**
   * Given a schema and context, evaluate which rules match and test them.
   * Recursively descend into schema object and iterate over each levels keys.
   * If we find a child of the object that isn't an Object ignore it, this will
   * be things that show up in meta and objects directories. If an an object
   * has a selectors key we know that this is an actual rule that we know how
   * to evaluate. Finally if what we have is an Object recurse on it to see if
   * its children have any rules.
   * @param schema
   * @param context
   */
  export function applyRules(
    schema: GenericSchema,
    context: psychDSContext,
    rootSchema?: GenericSchema,
    schemaPath?: string,
  ) {
    if (!rootSchema) {
      rootSchema = schema
    }
    if (!schemaPath) {
      schemaPath = 'schema'
    }
    Object.assign(context, expressionFunctions)
    // @ts-expect-error
    context.exists.bind(context)
    for (const key in schema) {
      if (!(schema[key].constructor === Object)) {
        continue
      }
      if ('selectors' in schema[key]) {
        evalRule(
          schema[key] as GenericRule,
          context,
          rootSchema,
          `${schemaPath}.${key}`,
        )
      } else if (schema[key].constructor === Object) {
        applyRules(
          schema[key] as GenericSchema,
          context,
          rootSchema,
          `${schemaPath}.${key}`,
        )
      }
    }
    return Promise.resolve()
  }
  
  const evalConstructor = (src: string): Function =>
    new Function('context', `with (context) { return ${src} }`)
  const safeHas = () => true 
  const safeGet = (target: any, prop: any) =>
    prop === Symbol.unscopables ? undefined : target[prop]
  
  const memoizedEvalConstructor = memoize(evalConstructor)
  
  export function evalCheck(src: string, context: psychDSContext) {
    const test = memoizedEvalConstructor(src)
    const safeContext = new Proxy(context, { has: safeHas, get: safeGet })
    try {
      return test(safeContext)
    } catch (error) {
      logger.debug(error)
      return false
    }
  }
  
  /**
   * Different keys in a rule have different interpretations.
   * We associate theys keys from a rule object to a function adds an
   * issue to the context if the rule evaluation fails.
   */
  // @ts-expect-error
  const evalMap: Record<
    keyof GenericRule,
    (
      rule: GenericRule,
      context: psychDSContext,
      schema: GenericSchema,
      schemaPath: string,
    ) => boolean | void
  > = {
    checks: evalRuleChecks,
    columns: evalColumns,
    fields: evalJsonCheck,
  }
  
  /**
   * Entrypoint for evaluating a individual rule.
   * We see if every selector applies to this context,
   * Then we attempt to interpret every other key in the rule
   * object.
   */
  function evalRule(
    rule: GenericRule,
    context: psychDSContext,
    schema: GenericSchema,
    schemaPath: string,
  ) {
    if (rule.selectors && !mapEvalCheck(rule.selectors, context)) {
      return
    }
    Object.keys(rule)
      .filter((key) => key in evalMap)
      .map((key) => {
        //@ts-expect-error
        evalMap[key](rule, context, schema, schemaPath)
      })
  }
  
  function mapEvalCheck(statements: string[], context: psychDSContext): boolean {
    return statements.every((x) => evalCheck(x, context))
  }
  
  /**
   * Classic rules interpreted like selectors. Examples in specification:
   * schema/rules/checks/*
   */
  function evalRuleChecks(
    rule: GenericRule,
    context: psychDSContext,
    schema: GenericSchema,
    schemaPath: string,
  ): boolean {
    if (rule.checks && !mapEvalCheck(rule.checks, context)) {
      if (rule.issue?.code && rule.issue?.message) {
        context.issues.add({
          key: rule.issue.code,
          reason: rule.issue.message,
          files: [{ ...context.file, evidence: schemaPath }],
          severity: rule.issue.level as Severity,
        })
      } else {
        context.issues.addNonSchemaIssue('CHECK_ERROR', [
          { ...context.file, evidence: schemaPath },
        ])
      }
    }
    return true
  }
  
  /**
   * schema.formats contains named types with patterns. Many entries in
   * schema.objects have a format to constrain its possible values. Presently
   * this is written with tsv's in mind. The blanket n/a pass may be inappropriate
   * for other type checks. filenameValidate predates this but does similar type
   * checking for entities.
   */
  function schemaObjectTypeCheck(
    schemaObject: SchemaTypeLike,
    value: string,
    schema: GenericSchema,
  ): boolean {
    // always allow n/a?
    if (value === 'n/a') {
      return true
    }
    if ('anyOf' in schemaObject) {
      return schemaObject.anyOf.some((x) =>
        schemaObjectTypeCheck(x, value, schema),
      )
    }
    if ('enum' in schemaObject && schemaObject.enum) {
      return schemaObject.enum.some((x) => x === value)
    }
    // @ts-expect-error
    const format = schema.objects.formats[schemaObject.type]
    const re = new RegExp(`^${format.pattern}$`)
    return re.test(value)
  }
  
  /**
   * Columns headers must all be included under the variableMeasured metadata property
   * The "columns" property on schema rules indicates that this is required
   */
  function evalColumns(
    rule: GenericRule,
    context: psychDSContext,
    schema: GenericSchema,
    schemaPath: string,
  ): void {
    if (context.extension !== '.csv') return
    const headers = [...Object.keys(context.columns)]
    let invalidHeaders : string[] = []
    for (const header of headers){
        if(!(context.validColumns.includes(header))){
            invalidHeaders = [...invalidHeaders,header]
        }
    }
    if(invalidHeaders.length != 0){
        context.issues.addNonSchemaIssue('CSV_COLUMN_MISSING', [
            {
              ...context.file,
              evidence: `Column headers: ${invalidHeaders} do not appear in variableMeasured. ${schemaPath}`,
            },
          ])
    }
    
  }
  
  /**
   * For evaluating field requirements and values that should exist in a json
   * sidecar for a file. Will need to implement an additional check/error for
   * `prohibitied` fields. Examples in specification:
   * schema/rules/sidecars/*
   *
   */
  function evalJsonCheck(
    rule: GenericRule,
    context: psychDSContext,
    schema: GenericSchema,
    schemaPath: string,
  ): void {
    for (const [key, requirement] of Object.entries(rule.fields)) {
      const severity = getFieldSeverity(requirement, context)
      //@ts-expect-error
      const keyName = schema.objects.metadata[key].name
      if (severity && severity !== 'ignore' && !(keyName in context.sidecar)) {
        if (requirement.issue?.code && requirement.issue?.message) {
          context.issues.add({
            key: requirement.issue.code,
            reason: requirement.issue.message,
            severity,
            files: [{ ...context.file }],
          })
        } else {
          context.issues.addNonSchemaIssue('JSON_KEY_REQUIRED', [
            {
              ...context.file,
              evidence: `missing ${keyName} as per ${schemaPath}`,
            },
          ])
        }
      }
    }
  }
  
  /**
   * JSON Field checks have conditions where their requirement levels can
   * change based on some other field. This function resolves the severity
   * of a JsonCheckFailure depending on how the checks level object is shaped.
   */
  function getFieldSeverity(
    requirement: string | SchemaFields,
    context: psychDSContext,
  ): Severity {
    // Does this conversion hold for other parts of the schema or just json checks?
    const levelToSeverity: Record<string, Severity> = {
      recommended: 'ignore',
      required: 'error',
      optional: 'ignore',
      prohibited: 'ignore',
    }
    let severity: Severity = 'ignore'
  
    if (typeof requirement === 'string' && requirement in levelToSeverity) {
      severity = levelToSeverity[requirement]
    } else if (typeof requirement === 'object' && requirement.level) {
      severity = levelToSeverity[requirement.level]
      const addendumRegex = /(required|recommended) if \`(\w+)\` is \`(\w+)\`/
      if (requirement.level_addendum) {
        const match = addendumRegex.exec(requirement.level_addendum)
        if (match && match.length === 4) {
          const [_, addendumLevel, key, value] = match
          // @ts-expect-error
          if (key in context.sidecar && context.sidecar[key] === value) {
            severity = levelToSeverity[addendumLevel]
          }
        }
      }
    }
    return severity
  }