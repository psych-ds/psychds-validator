import { SummaryOutput, SubjectMetadata } from '../types/validation-result.ts'
import { psychDSContext } from '../schema/context.ts'


export class Summary {
  totalFiles: number
  size: number
  dataProcessed: boolean
  pet: Record<string, any>
  dataTypes: Set<string>
  schemaVersion: string
  constructor() {
    this.dataProcessed = false
    this.totalFiles = -1
    this.size = 0
    this.pet = {}
    this.dataTypes = new Set()
    this.schemaVersion = ''
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

    if (context.extension === '.json') {
      const parsedJson = await context.json
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
    }
  }
}