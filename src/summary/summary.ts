import { SummaryOutput } from '../types/validation-result.ts'
import { psychDSContext } from '../schema/context.ts'


export class Summary {
  totalFiles: number
  size: number
  dataProcessed: boolean
  // deno-lint-ignore no-explicit-any
  pet: Record<string, any>
  dataTypes: Set<string>
  schemaVersion: string
  suggestedColumns: string[]
  constructor() {
    this.dataProcessed = false
    this.totalFiles = -1
    this.size = 0
    this.pet = {}
    this.dataTypes = new Set()
    this.schemaVersion = ''
    this.suggestedColumns = []
  }
  async update(context: psychDSContext): Promise<void> {
    if (context.file.path.startsWith('/derivatives') && !this.dataProcessed) {
      return
    }

    this.totalFiles++
    this.size += await context.file.size

    if (context.datatype.length) {
      this.dataTypes.add(context.datatype)
    }

  }

  formatOutput(): SummaryOutput {
    return {
      totalFiles: this.totalFiles,
      size: this.size,
      dataProcessed: this.dataProcessed,
      pet: this.pet,
      dataTypes: Array.from(this.dataTypes),
      schemaVersion: this.schemaVersion,
      suggestedColumns: this.suggestedColumns
    }
  }
}