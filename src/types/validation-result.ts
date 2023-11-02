// deno-lint-ignore-file no-explicit-any
import { DatasetIssues } from '../issues/datasetIssues.ts'

export interface SubjectMetadata {
  participantId: string
  age: number
  sex: string
}
/*
    BodyPart: {},
    ScannerManufacturer: {},
    ScannerManufacturersModelName: {},
    TracerName: {},
    TracerRadionuclide: {},
*/

export interface SummaryOutput {
  totalFiles: number
  size: number
  dataProcessed: boolean
  pet: Record<string, any>
  dataTypes: string[]
  schemaVersion: string
  suggestedColumns: string[]
}

/**
 * The output of a validation run
 */
export interface ValidationResult {
  valid: boolean
  issues: DatasetIssues
  summary: SummaryOutput
  derivativesSummary?: Record<string, ValidationResult>
}