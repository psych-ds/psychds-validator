/**
 * Schema structure returned by loadSchema
 */

export interface Format {
  pattern: string
}

export interface SchemaObjects {
  files: Record<string, unknown>
  formats: Record<string, Format>
}

export interface SchemaRules {
  files: SchemaFiles
  modalities: Record<string, unknown>
}

export interface SchemaFiles {
  common: Record<string, unknown>
  deriv: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface ExpressionTest {
  expression: string
  result: string
}

export interface SchemaMeta {
  expression_tests: ExpressionTest[]
}

export interface Schema {
  objects: SchemaObjects
  rules: SchemaRules
  schema_version: string
  meta: SchemaMeta
  schemaOrg: object
}

export interface SchemaIssue {
  code: string
  message: string
  level?: string
}

export interface SchemaOrgIssues {
  termIssues: string[],
  unknownNamespaceIssues: string[],
  typeIssues: string[],
  typeMissingIssues: string[]
}

export type GenericSchema = { [key: string]: GenericRule | GenericSchema | GenericRuleOrg }

export interface GenericRuleOrg {
  multivalued?: boolean,
  any_of?: object[],
  range?: string,
  is_a?: string,
  comments?: string[],
  slot_uri?: string,
  class_uri?: string,
  slots?: string[],
}

export interface GenericRule {
  selectors?: string[]
  checks?: string[]
  columns?: Record<string, string>
  additional_columns?: string
  initial_columns?: string[]
  fields: Record<string, SchemaFields>
  jsonld?: boolean
  issue?: SchemaIssue
  extensions?: string[]
  suffix?: string
  stem?: string
  path?: string
  code?: string
  level?: string
  baseDir?: string
  reason?: string
  datatypes?: string[]
  pattern?: string
  name?: string
  format?: string
  required?: string
  index_columns?: string[]
}

export interface SchemaFields {
  level: string
  level_addendum?: string
  issue?: SchemaIssue
}

interface SchemaType {
  type: string
  enum?: string[]
}

interface AnyOf {
  anyOf: SchemaType[]
}

export type SchemaTypeLike = AnyOf | SchemaType