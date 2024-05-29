/**
 * Utilities for formatting human readable output (CLI or other UIs)
 */
import { prettyBytes } from '../deps/prettyBytes.ts'
import { Table } from '../deps/cliffy.ts'
import { colors } from '../deps/fmt.ts'
import { ValidationResult, SummaryOutput } from '../types/validation-result.ts'
import { Issue } from '../types/issues.ts'

interface LoggingOptions {
  verbose: boolean
  showWarnings: boolean
}

/**
 * Format for Unix consoles
 *
 * Returns the full output string with newlines
 */
export function consoleFormat(
  result: ValidationResult,
  options?: LoggingOptions,
): string {
  const output = []
  const errors = [...result.issues.values()].filter(issue => issue.severity === "error")
  const warnings = [...result.issues.values()].filter(issue => issue.severity === "warning")
  const csv_issue = [...result.issues.values()].filter(issue => issue.key === "CSV_COLUMN_MISSING").length === 1
  if (errors.length === 0) {
    output.push(colors.green(`
        **********************************************
        This dataset appears to be psych-DS compatible
        **********************************************\n`))
    if (options?.showWarnings){
        warnings.forEach((issue) => output.push(formatIssue(issue, options)))
    }
  } else {
    output.push(colors.red(`
        ******************************************************
        This dataset does not appear to be psych-DS compatible
        ******************************************************\n`))
    errors.forEach((issue) => output.push(formatIssue(issue, options)))
    if (options?.showWarnings){
        warnings.forEach((issue) => output.push(formatIssue(issue, options)))
    }
  }
  if(csv_issue){
    output.push('')
    output.push(`There was an issue with your variableMeasured value. Here is a suggested value:`)
    output.push('')
    output.push(JSON.stringify(result.summary.suggestedColumns))
  }
  output.push('')
  output.push(formatSummary(result.summary))
  output.push('')
  return output.join('\n')
}

/**
 * Format one issue as text with colors
 */
function formatIssue(issue: Issue, options?: LoggingOptions): string {
  const severity = issue.severity
  const color = severity === 'error' ? 'red' : 'yellow'
  const output = []
  output.push(
    '\t' +
      colors[color](
        `[${severity.toUpperCase()}] ${issue.reason} (${issue.key})`,
      ),
  )
  output.push('')
  let fileOutCount = 0
  issue.files.forEach((file) => {
    if (!options?.verbose && fileOutCount > 2) {
      return
    }
    output.push('\t\t.' + file.path)
    if (file.line) {
      let msg = '\t\t\t@ line: ' + file.line
      if (file.character) {
        msg += ' character: ' + file.character
      }
      output.push(msg)
    }
    if (file.evidence) {
      output.push('\t\t\tEvidence: ' + file.evidence)
    }
    fileOutCount++
  })
  if (!options?.verbose) {
    output.push('')
    output.push('\t\t' + issue.files.size + ' more files with the same issue')
  }
  output.push('')

  return output.join('\n')
}

/**
 * Format for the summary
 */
function formatSummary(summary: SummaryOutput): string {
  const output = []

  // data
  const column1 = [
      summary.totalFiles + ' ' + 'Files' + ', ' + prettyBytes(summary.size)]
  const pad = '       '

  // headers
  const headers = [
    pad,
    colors.magenta('Summary:') + pad
  ]

  // rows
  const rows = []
  for (let i = 0; i < column1.length; i++) {
    const val1 = column1[i] ? column1[i] + pad : ''
    rows.push([pad, val1])
  }
  const table = new Table()
    .header(headers)
    .body(rows)
    .border(false)
    .padding(1)
    .indent(2)
    .toString()

  output.push(table)

  output.push('')

  //Neurostars message
  output.push(
    colors.cyan(
      '\tIf you have any questions, please post on https://neurostars.org/tags/bids.',
    ),
  )

  return output.join('\n')
}