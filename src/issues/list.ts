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
      'but if you would like to avoid receiving this warning moving forward, you can include ' +
      'in your ".psychdsignore" file' 
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
}

export const nonSchemaIssues = { ...filenameIssues }
