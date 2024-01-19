/*
 * CSV
 * Module for parsing CSV
 */
import { ColumnsMap } from '../types/columns.ts'

const normalizeEOL = (str: string): string =>
  str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
// Typescript resolved `row && !/^\s*$/.test(row)` as `string | boolean`
const isContentfulRow = (row: string): boolean => !!(row && !/^\s*$/.test(row))

// gets columns from CSV
export function parseCSV(contents: string) {
  const columns = new ColumnsMap()
  const issues: string[] = []
  const rows: string[][] = normalizeEOL(contents)
    .split('\n')
    .filter(isContentfulRow)
    .map((str) => {
      //extra logic to confirm that commas used within double quotes are maintained and not considered delimiters
      const matches = str.match(/".*"/)
      matches?.forEach((match) => {
        const newMatch = match.replace(",","[REPLACE]")
        str = str.replace(match,newMatch)
      })
     return str.split(',').map((x)=>x.replace("[REPLACE]",","))
    })
  const headers = rows.length ? rows[0] : []
  
  if (headers.length === 0)
    issues.push('NO_HEADER')
  else{
    if(!rows.slice(1).every((row) => row.length === headers.length))
      issues.push("HEADER_ROW_MISMATCH")
  }

  headers.map((x) => {
    columns[x] = []
  })
  for (let i = 1; i < rows.length; i++) {
    for (let j = 0; j < headers.length; j++) {
      const col = columns[headers[j]] as string[]
      col.push(rows[i][j])
    }
  }
  if (Object.keys(columns).includes("row_id") && [...new Set(columns["row_id"] as string[])].length !== (columns["row_id"] as string[]).length)
    issues.push("ROWID_VALUES_NOT_UNIQUE")

  const response = {
    'columns':columns as ColumnsMap,
    'issues':issues as string[]
  }
  return response
}