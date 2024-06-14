/*
 * CSV
 * Module for parsing CSV
 */

import { ColumnsMap } from '../types/columns.ts'
import { parse } from "jsr:@std/csv";

const normalizeEOL = (str: string): string =>
  str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export interface csvIssue {
  issue: string
  message: string | null
}

// gets columns from CSV
export function parseCSV(contents: string) {
  const columns = new ColumnsMap()
  const issues: csvIssue[] = []
  const normalizedStr = normalizeEOL(contents)
  try{
    const rows : string[][] = parse(normalizedStr)
    const headers = rows.length ? rows[0] : []
  
    //if no header is present, log error
    if (headers.length === 0)
      issues.push({'issue':'NoHeader','message':null})
    else{
      //if any row in CSV contains different number of cells than the header, log error
      if(!rows.slice(1).every((row) => row.length === headers.length))
        issues.push({'issue':'HeaderRowMismatch','message':null})
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
    //if header called "row_id" is present, assert that all cells are unique values
    if (Object.keys(columns).includes("row_id") && [...new Set(columns["row_id"] as string[])].length !== (columns["row_id"] as string[]).length)
      issues.push({'issue':'RowidValuesNotUnique','message':null})
  }
  catch(error){
    issues.push({'issue':'CSVFormattingError','message':error.message})
  }
  

  //response has been modified to return columns object as well as issues object, 
  //to account for the fact that multiple types of issues are now possible
  const response = {
    'columns':columns as ColumnsMap,
    'issues':issues as csvIssue[]
  }
  return response
}