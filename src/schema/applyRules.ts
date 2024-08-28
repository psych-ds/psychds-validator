import {
    GenericRule,
    GenericRuleOrg,
    GenericSchema,
    SchemaFields,
    SchemaOrgIssues,
  } from '../types/schema.ts'
import { Severity } from '../types/issues.ts'
import { psychDSContext } from './context.ts'
import { logger } from '../utils/logger.ts'
import { memoize } from '../utils/memoize.ts'
import { psychDSFile } from '../types/file.ts';
  
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
  
  // deno-lint-ignore ban-types
  const evalConstructor = (src: string): Function =>
    new Function('context', `with (context) { return ${src} }`)
  const safeHas = () => true 
  // deno-lint-ignore no-explicit-any
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
        //@ts-expect-error: most props not needed
        evalMap[key](rule, context, schema, schemaPath)
      })
  }
  
  function mapEvalCheck(statements: string[], context: psychDSContext): boolean {
    return statements.every((x) => evalCheck(x, context))
  }
  
  
  /**
   * Columns headers must all be included under the variableMeasured metadata property
   * The "columns" property on schema rules indicates that this is required
   */
  function evalColumns(
    _rule: GenericRule,
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
        context.issues.addSchemaIssue('CsvColumnMissing', [
            {
              ...context.file,
              evidence: `Column headers: [${invalidHeaders}] do not appear in variableMeasured. ${schemaPath}`,
            },
          ])
    }

    //since the inherited structure for issues links them to "files" rather than "instances",
    //we collect each instance of the following issues in a dictionary so that they can be added all at once
    //to the issue corresponding to their file. For instance, if multiple "types" are missing in one metadata file,
    //we collect all the locations within the file that the types are missing, then add them all within one issue
    //for the given file
    const schemaOrgIssues = {
      'termIssues': [] as string[],
      'unknownNamespaceIssues': [] as string[],
      'typeIssues': [] as string[],
      'typeMissingIssues': [] as string[]
    } as SchemaOrgIssues
    //run full schema.org validity check
    schemaCheck(
      context,
      schema,
      schemaOrgIssues
    )
    
  }
  
  /**
   * For evaluating field requirements and values that should exist in a json
   * sidecar for a file. Includes all checks for schema.org validity.
   *
   */
  function evalJsonCheck(
    rule: GenericRule,
    context: psychDSContext,
    _schema: GenericSchema,
    schemaPath: string,
  ){

    //issue collection for missing JSON fields as required in schema
    const issueKeys: string[]  = []
    //loop through all the fields found in dataset_metadata.yaml, along with their requirement levels 
    for (const [key, requirement] of Object.entries(rule.fields)) {
      const severity = getFieldSeverity(requirement, context)
      const keyName = `https://schema.org/${key}`
      //expandedSidecar represents the metadata object with all contexts added, e.g. the "name" field becomes the "https://schema.org/name" field.
      //we add this schema.org namespace to keyName to account for this.
      if (severity && severity !== 'ignore' && !(keyName in context.expandedSidecar)) {
        if (requirement.issue?.code && requirement.issue?.message) {
          context.issues.add({
            key: requirement.issue.code,
            reason: requirement.issue.message,
            severity,
            files: [{ ...context.file }],
          })
        } else {
          issueKeys.push(key)
        }
      }
    }
    //once all missing fields are found, create issue
    if(issueKeys.length != 0){
      context.issues.addSchemaIssue('JsonKeyRequired', [
        {
          ...context.file,
          evidence: `metadata object missing fields: [${issueKeys}] as per ${schemaPath}. 
                    If these fields appear to be present in your metadata, then there may be an issue with your schema.org context`,
        },
      ])
    }
    
  }

  //Wrapper function for recursive schema.org validity check. Checks type requirements for root object, 
  //then delves recursively into sub-objects as necessary
  function schemaCheck(
    context: psychDSContext,
    schema: GenericSchema,
    issues: SchemaOrgIssues
  ){
    const schemaNamespace = 'https://schema.org/'
    //@type is required in the root object of the metadata file
    if ("@type" in context.expandedSidecar){
      //@type for the root object must be schema.org/Dataset
      //TODO: Check if it's even valid JSON-LD to have more than one values assigned for type
        //if it is valid, it should be accounted for
      if ((context.expandedSidecar['@type'] as string[])[0] !== `${schemaNamespace}Dataset`){
        let issueFile: psychDSFile
        if(Object.keys(context.metadataProvenance).includes('@type'))
          issueFile = context.metadataProvenance['@type']
        else
          issueFile = context.dataset.metadataFile
        context.issues.addSchemaIssue('IncorrectDatasetType', [
          {
            ...issueFile,
            evidence: `dataset_description.json's "@type" property must have "Dataset" as its value.
                      additionally, the term "Dataset" must implicitly or explicitly use the schema.org namespace.
                      The schema.org namespace can be explicitly set using the "@context" key`,
          },
        ])
        return
      }
    }
    else{
      context.issues.addSchemaIssue('MissingDatasetType', [
        {
          ...context.file,
          evidence: `dataset_description.json must have either the "@type" or the "type" property.`,
        },
      ])
      return
    }
    //collect issues recursively for all keys and values in root object
    issues = _schemaCheck(context.expandedSidecar, context, schema, '',schemaNamespace,issues)
    logSchemaIssues(context,issues)
  }

  //Utility function to unpack schemaOrgIssues object into main issues object
  function logSchemaIssues(
    context:psychDSContext,
    issues: SchemaOrgIssues
  ){
    if(issues.termIssues.length != 0){
      issues.termIssues.forEach((issue) => {
        const rootKey = issue.split('.')[1]
        let issueFile: psychDSFile
        //check to see which metadata file the key with the issue comes from
        if(Object.keys(context.metadataProvenance).includes(rootKey))
          issueFile = context.metadataProvenance[rootKey]
        else
          issueFile = context.dataset.metadataFile

        context.issues.addSchemaIssue('InvalidSchemaorgProperty', [
          {
            ...issueFile,
            evidence: `This file contains one or more keys that use the schema.org namespace, but are not  official schema.org properties.
                      According to the psych-DS specification, this is not an error, but be advised that these terms will not be
                      machine-interpretable and do not function as linked data elements. These are the keys in question: [${issues.termIssues}]`,
          },
        ])
        
      })
      
    }
    if(issues.typeIssues.length != 0){
      issues.typeIssues.forEach((issue) => {
        const rootKey = issue.split('.')[1]
        let issueFile: psychDSFile
        //check to see which metadata file the key with the issue comes from
        if(rootKey in context.metadataProvenance)
          issueFile = context.metadataProvenance[rootKey]
        else
          issueFile = context.dataset.metadataFile

        context.issues.addSchemaIssue('InvalidObjectType', [
          {
            ...issueFile,
            evidence: `This file contains one or more objects with types that do not match the selectional constraints of their keys.
                        Each schema.org property (which take the form of keys in your metadata json) has a specific range of types
                        that can be used as its value. Type constraints for a given property can be found by visiting their corresponding schema.org
                        URL. All properties can take strings or URLS as objects, under the assumption that the string/URL represents a unique ID.
                        Type selection errors occured at the following locations in your json structure: [${issues.typeIssues}]`,
          },
        ])
        
      })
      
    }
    if(issues.typeMissingIssues.length != 0){
      issues.typeMissingIssues.forEach((issue) => {
        const rootKey = issue.split('.')[1]
        let issueFile: psychDSFile
        //check to see which metadata file the key with the issue comes from
        if(Object.keys(context.metadataProvenance).includes(rootKey))
          issueFile = context.metadataProvenance[rootKey]
        else
          issueFile = context.dataset.metadataFile

        context.issues.addSchemaIssue('ObjectTypeMissing', [
          {
            ...issueFile,
            evidence: `This file contains one or more objects without a @type property. Make sure that any object that you include
                      as the value of a schema.org property contains a valid schema.org @type, unless it is functioning as some kind of 
                      base type, such as Text or URL, containing a @value key. @type is optional, but not required on such objects.
                      The following objects without @type were found: [${issues.typeMissingIssues}]`,
          },
        ])
        
      })
      
    }
    if(issues.unknownNamespaceIssues.length != 0){
      issues.unknownNamespaceIssues.forEach((issue) => {
        const rootKey = issue.split('.')[0]
        let issueFile: psychDSFile
        //check to see which metadata file the key with the issue comes from
        if(Object.keys(context.metadataProvenance).includes(rootKey))
          issueFile = context.metadataProvenance[rootKey]
        else
          issueFile = context.dataset.metadataFile

        context.issues.addSchemaIssue('UnknownNamespace', [
          {
            ...issueFile,
            evidence: `This file contains one or more references to namespaces other than https://schema.org:
                      [${issues.unknownNamespaceIssues}].`,
          },
        ])
        
      })
    }
  }

  //recursive function for checking a particular node of the metadata object
  //if another typed object is found as the value for a given property,
  //recurse into that node and run the same check, until no objects are found
  //as values for any property
  /*
  * node: a json within the metadata file. starting with the root
  * objectPath: a string value to keep track of where within the metadata file certain issues were found
  */
  function _schemaCheck(
    node: object,
    context: psychDSContext,
    schema: GenericSchema,
    objectPath: string,
    nameSpace: string,
    issues: SchemaOrgIssues
  ) : SchemaOrgIssues{
    let superClassSlots: string[] = []
    let thisType = ''
    if('@type' in node){
      thisType = (node['@type'] as string[])[0]
      //recurse through the schemaOrg schema to find all superClasses of this type and aggregate their valid slots
      superClassSlots = getSuperClassSlots(thisType,schema,nameSpace) as string[]
    }
    //loop through current json node
    for(const [key,value] of Object.entries(node)){
      //ignore JSON-LD privileged vocabulary
      if(key.startsWith('@'))
        continue
      else{
        //produce warning if metadata uses namespaces other than schema.org
        if(!key.startsWith(nameSpace)){
          issues.unknownNamespaceIssues.push(key)
          continue
        }
        else{
          const property = key.replace(nameSpace,"")
          let range: string[] = []
          //if property exists in master list of schema.org slots
          if(property in schema[`schemaOrg.slots`]){
            //if slot has a single range, add it to the list of ranges and then also add all types from subclasses recursively
            if('range' in schema[`schemaOrg.slots.${property}`]){
              range.push(schema[`schemaOrg.slots.${property}.range`] as string)
              range = range.concat(getSubClassSlots(schema[`schemaOrg.slots.${property}.range`] as string,schema,nameSpace))   
            }
            //if slot has multiple valid ranges
            if('any_of' in schema[`schemaOrg.slots.${property}`]){
              for(const ran of (schema[`schemaOrg.slots.${property}`] as GenericRuleOrg).any_of as object[]){
                if('range' in ran){
                  range.push(ran.range as string)
                  range = range.concat(getSubClassSlots(ran.range as string,schema,nameSpace))
                }
              }
            }
          }
          //TODO: add else statement? if property is not a valid schema.org slot at all
          let subKeys: string[] = []
          //if current property is not a valid slot of this object type, raise issue
          if (!(superClassSlots.includes(property))){
            issues.termIssues.push(`${objectPath}.${property}`)
          }
          else{
            //loop through all objects listed as value for this property
            for(let i = 0; i < value.length; i++){
              const obj = value[i]
              subKeys = Object.keys(obj)
              //if object is not an untyped "value/id" object (i.e. it was a string in the compacted json-LD)
              if(!(subKeys.length === 1 && (subKeys.includes("@id") || subKeys.includes("@value")))){
                //if object is typed
                if(subKeys.includes('@type')){
                  //sometimes the value of type is rendered as a list, sometimes as a string
                  const objType = (Array.isArray(obj['@type'])) ? obj['@type'][0].replace(nameSpace,'') : obj['@type'].replace(nameSpace,'')
                  //checks to see if object's type is within range of valid object types
                  //including "text" and "url" types, which are valid for all slots
                  if(![...range,"Text","URL"].includes(objType))
                    issues.typeIssues.push(`${objectPath}.${property}${i === 0 ? '' : `[${i}]`}`)
                  //recurse into object to check its slots and sub-objects. 
                  //append this property to objectpath to track location within json
                  issues = (_schemaCheck(obj,context,schema,`${objectPath}.${property}`,nameSpace,issues))
                }
                //if untyped, raise issue
                else(
                  issues.typeMissingIssues.push(`${objectPath}.${property}${i === 0 ? '' : `[${i}]`}`)
                  
                )
              }
            }
          }
        }
      }
    }
    return issues
  }

  //recursive function to crawl up schema.org taxonomy to collect slots from all superclasses of type
  //ex: If Dataset has slots for properties X Y and Z, and Dataset is a Thing, then the full list of slots
  //for Dataset should be X Y Z + whatever slots are available for Thing, etc
  function getSuperClassSlots(
    type: string,
    schema: GenericSchema,
    nameSpace: string
  ): string[]{
    
    if(type.includes(nameSpace)){
      type = type.replace(nameSpace,"")
    }
    if(type in schema[`schemaOrg.classes`]){
      //if type has a super class, append this type's slots to the result of this function for super class
      if('is_a' in schema[`schemaOrg.classes.${type}`]){
        if('slots' in schema[`schemaOrg.classes.${type}`]){
          return (schema[`schemaOrg.classes.${type}.slots`] as unknown as string[]).concat(getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`] as unknown as string,schema,nameSpace))

        }
        else
          return getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`] as unknown as string,schema,nameSpace)
      }
      //TODO: shouldn't another if statement to check for slots presence be needed here?
      else
        return schema[`schemaOrg.classes.${type}.slots`] as unknown as string[]

    }
    return []
  }

  //recursive function for finding all classes that are more specific versions of a given class
  //ex: if the property X specifies that its value must be of type Y, then its value may also
  //be of any type for which Y is a super class.
  function getSubClassSlots(
    type: string,
    schema: GenericSchema,
    nameSpace: string
  ): string[]{
    const subClasses: string[] = []
    if(type.includes(nameSpace)){
      type = type.replace(nameSpace,"")
    }
    if(type in schema[`schemaOrg.classes`]){
      //loop through all classes, find those for which the given type is a superclass.
      //add to subClasses list and recurse for the class in question
      for(const [key,value] of Object.entries(schema['schemaOrg.classes'])){
          if("is_a" in value && value['is_a'] === type){
            subClasses.push(key)
            subClasses.concat(getSubClassSlots(key,schema,nameSpace))
          }
      }
      return subClasses
    }
    else
      return []
  }
  

  /**
   * 
   * @param context 
   * 
   * Attempts to use jsonld.js to expand the metadata JSON and remove the "@context" by expanding all terms to their full IRIs.
   * catches any error that the expand function throws and hands it to context.issues. 
   */
  

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
          // @ts-expect-error: sidecar assumed
          if (key in context.sidecar && context.sidecar[key] === value) {
            severity = levelToSeverity[addendumLevel]
          }
        }
      }
    }
    return severity
  }