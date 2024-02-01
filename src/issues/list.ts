import { IssueDefinitionRecord } from '../types/issues.ts'

export const filenameIssues: IssueDefinitionRecord = {
  DATATYPE_MISMATCH: {
    severity: 'error',
    reason:
      'The datatype directory does not match datatype of found suffix and extension',
  },
  ALL_FILENAME_RULES_HAVE_ISSUES: {
    severity: 'error',
    reason:
      'Multiple filename rules were found as potential matches. All of them had at least one issue during filename validation.',
  },
  EXTENSION_MISMATCH: {
    severity: 'error',
    reason:
      'Extension used by file does not match allowed extensions for its suffix',
  },
  JSON_KEY_REQUIRED: {
    severity: 'error',
    reason: "The dataset_description.json file is missing a key listed as required.",
  },
  JSON_KEY_RECOMMENDED: {
    severity: 'warning',
    reason: 'A data files JSON sidecar is missing a key listed as recommended.',
  },
  TSV_ERROR: {
    severity: 'error',
    reason: 'generic place holder for errors from tsv files',
  },
  CSV_COLUMN_MISSING: {
    severity: 'error',
    reason: 'A required column is missing',
  },
  TSV_COLUMN_ORDER_INCORRECT: {
    severity: 'error',
    reason: 'Some TSV columns are in the incorrect order',
  },
  TSV_ADDITIONAL_COLUMNS_NOT_ALLOWED: {
    severity: 'error',
    reason:
      'A TSV file has extra columns which are not allowed for its file type',
  },
  TSV_INDEX_VALUE_NOT_UNIQUE: {
    severity: 'error',
    reason:
      'An index column(s) was specified for the tsv file and not all of the values for it are unique.',
  },
  TSV_VALUE_INCORRECT_TYPE: {
    severity: 'error',
    reason:
      'A value in a column did match the acceptable type for that column headers specified format.',
  },
  CHECK_ERROR: {
    severity: 'error',
    reason:
      'generic place holder for errors from failed `checks` evaluated from schema.',
  },
  NOT_INCLUDED: {
    severity: 'warning',
    reason:
      'Files with such naming scheme are not part of psych-DS specification. ' +
      'Under the rules of psych-DS, non-specified files are allowed to be included, ' +
      'but if you would like to avoid receiving this warning moving forward, you can add ' +
      'the following lines into your ".psychdsignore" file' 
  },
  MISSING_REQUIRED_ELEMENT: {
    severity: 'error',
    reason: 'Your dataset is missing an element that is required under the ' +
        'psych-DS  specification.'
  },
  EMPTY_FILE: {
    severity: 'error',
    reason: 'Empty files not allowed.',
  },
  INVALID_JSON_FORMATTING: {
    severity: 'error',
    reason: 'One of your metadata files is not in valid JSON format.'
  },
  INCORRECT_DATASET_TYPE: {
    severity: 'error',
    reason: 'Your metadata is missing the required schema.org "Dataset" type'
  },
  MISSING_DATASET_TYPE: {
    severity: 'error',
    reason: 'Your metadata object is missing the "@type"/"type" property.'
  },
  UNKNOWN_NAMESPACE: {
    severity: 'warning',
    reason: 'The psych-DS validator only has access to one external vocabulary, "http://schema.org";' +
            'any other reference to an external schema is permitted, but the validity of the terms used ' +
            'cannot be confirmed.'
  },
  OBJECT_TYPE_MISSING: {
    severity: 'warning',
    reason: `For compliance with the schema.org ontology, all objects within the metadata (with a few exceptions)
            that appear as the value of a schema.org key/property must contain a "@type" key with a valid schema.org type 
            as its value.`

  },
  INVALID_SCHEMAORG_PROPERTY: {
    severity: 'warning',
    reason: `The schema.org ontology contains a fixed set of legal properties which can be applied to objects within the metadata.
            If schema.org is used as the only @context within your metadata, then all properties will be interpreted as schema.org properties.
            Using an invalid schema.org property is not considered an error in the psych-DS specification, but it should be understood
            that such usages result in the property in question not being interpretable by machines`
  },
  INVALID_OBJECT_TYPE: {
    severity: 'warning',
    reason: `Properties in the schema.org ontology have selective restrictions on which types of objects can be used for their values.
            including an object with a @type that does not match the selective restrictions of its property is not an error in psych-DS,
            but it will result in the object in question not being interpretable by machines.`
  },
  KEYWORD_FORMATTING_ERROR:{
    severity: 'error',
    reason: 'Datafiles must use keyword formatting. Keywords are defined as pairs of keys and values separated by a hypen, with underscores between each keyword pair.'
  },
  UNOFFICIAL_KEYWORD_WARNING:{
    severity: 'warning',
    reason: `The psych-DS schema model has a list of official keywords that can be used in filenames.
            The official keywords are study, site, subject, session, task, condition, trial, stimulus, and description.
            Using unofficial keywords does not result in an error, but users should make an effort to define their new keywords well
            and use them consistently.`
  },
  WRONG_METADATA_LOCATION:{
    severity: 'warning',
    reason: 'Files named "dataset_description.json" only count as valid metadata objects when they are located within the base directory.'
  }
}

export const nonSchemaIssues = { ...filenameIssues }
