import {
    Context,
    ContextDataset
  } from '../types/context.ts'
  import { psychDSFile } from '../types/file.ts'
  import { FileTree } from '../types/filetree.ts'
  import { ColumnsMap } from '../types/columns.ts'
  import { readElements } from './elements.ts'
  import { DatasetIssues } from '../issues/datasetIssues.ts'
  import { parseCSV } from '../files/csv.ts'
  import { ValidatorOptions } from '../setup/options.ts'
  import { logger } from '../utils/logger.ts'
  
  export class psychDSContextDataset implements ContextDataset {
    dataset_description: Record<string, unknown>
    options?: ValidatorOptions
    // deno-lint-ignore no-explicit-any
    files: any[]
    baseDirs: string[]
    tree: object
    // deno-lint-ignore no-explicit-any
    ignored: any[]
  
    constructor(options?: ValidatorOptions, description = {}) {
      this.dataset_description = description
      this.files = []
      this.baseDirs = []
      this.tree = {}
      this.ignored = []
      if (options) {
        this.options = options
      }
      if (
        !this.dataset_description.DatasetType &&
        this.dataset_description.GeneratedBy
      ) {
        this.dataset_description.DatasetType = 'derivative'
      } else if (!this.dataset_description.DatasetType) {
        this.dataset_description.DatasetType = 'raw'
      }
    }
  }
  
  const defaultDsContext = new psychDSContextDataset()
  
  export class psychDSContext implements Context {
    // Internal representation of the file tree
    fileTree: FileTree
    filenameRules: string[]
    issues: DatasetIssues
    file: psychDSFile
    fileName: string
    extension: string
    suffix: string
    baseDir: string
    keywords: Record<string, string>
    dataset: ContextDataset
    datatype: string
    sidecar: object
    columns: ColumnsMap
    suggestedColumns: string[]
    validColumns: string[]
  
    constructor(
      fileTree: FileTree,
      file: psychDSFile,
      issues: DatasetIssues,
      dsContext?: psychDSContextDataset,
    ) {
      this.fileTree = fileTree
      this.filenameRules = []
      this.issues = issues
      this.file = file
      this.fileName = file.name.split('.')[0]
      this.baseDir = file.path.split('/').length > 2 ? file.path.split('/')[1] : '/'
      const elements = readElements(file.name)
      this.keywords = elements.keywords
      this.extension = elements.extension
      this.suffix = elements.suffix
      this.dataset = dsContext ? dsContext : defaultDsContext
      this.datatype = ''
      this.sidecar = dsContext ? dsContext.dataset_description : {}
      this.validColumns = []
      this.columns = new ColumnsMap()
      this.suggestedColumns = []
    }
  
    // deno-lint-ignore no-explicit-any
    get json(): Promise<Record<string, any>> {
      return this.file
        .text()
        .then((text) => JSON.parse(text))
        .catch((_error) => {})
    }
    get path(): string {
      return this.file.path
    }
  
    /**
     * Implementation specific absolute path for the dataset root
     *
     * In the browser, this is always at the root
     */
    get datasetPath(): string {
      return this.fileTree.path
    }
  
    /**
     * Crawls fileTree from root to current context file, loading any valid
     * json sidecars found.
     */
    async loadSidecar(fileTree?: FileTree) {
      if (!fileTree) {
        fileTree = this.fileTree
      }
      const validSidecars = fileTree.files.filter((file) => {
        const { suffix, extension } = readElements(file.name)
        
        return (
          // TODO: Possibly better to just specify that files matching any rule from the metadata.yaml file are sidecars
          (
            extension === '.json' &&
            suffix === this.suffix &&
            file.name.split('.')[0] === this.fileName
            //TODO: decide how strictly the keyword format should be applied
            /* Object.keys(keywords).every((keyword) => {
                return (
                keyword in this.keywords &&
                keywords[keyword] === this.keywords[keyword]
                )
            }) */
          ) ||
          (
            extension === '.json' &&
            file.name.split('.')[0] == "file_metadata"
          ) 
           
        )
      })
      if (validSidecars.length > 1) {
        const exactMatch = validSidecars.find(
          (sidecar) =>
            sidecar.path == this.file.path.replace(this.extension, '.json'),
        )
        if (exactMatch) {
          validSidecars.splice(1)
          validSidecars[0] = exactMatch
        } else {
          logger.warning(
            `Multiple sidecar files detected for '${this.file.path}'`,
          )
        }
      }
  
      if (validSidecars.length === 1) {
        const json = await validSidecars[0]
          .text()
          .then((text) => JSON.parse(text))
          .catch((_error) => {})
        this.sidecar = { ...this.sidecar, ...json }
      }
      const nextDir = fileTree.directories.find((directory) => {
        return this.file.path.startsWith(directory.path)
      })
      if (nextDir) {
        await this.loadSidecar(nextDir)
      }
    }
  
    // get validColumns from metadata sidecar
    loadValidColumns() {
        if (this.extension !== '.csv') {
            return
          }

        const variableMeasured = ('variableMeasured' in this.sidecar) ? this.sidecar.variableMeasured : this.dataset.dataset_description.variableMeasured
        if(!variableMeasured){
            return
        }
        
        let validColumns :string[] = []

        for(const variable of variableMeasured as Array<string|Record<string,string>>){
            if(typeof variable === "string"){
                validColumns = [...validColumns,variable]
            } else {
                validColumns = [...validColumns,variable['name']]
            }
        }

        this.validColumns = validColumns
    }
  
    // get columns from csv file
    async loadColumns(): Promise<void> {
      if (this.extension !== '.csv') {
        return
      }
      this.columns = await this.file
        .text()
        .then((text) => parseCSV(text))
        .catch((error) => {
          logger.warning(
            `csv file could not be opened by loadColumns '${this.file.path}'`,
          )
          logger.debug(error)
          return new Map<string, string[]>() as ColumnsMap
        })
      return
    }
  
    async asyncLoads() {
      await Promise.allSettled([
        this.loadSidecar(),
        this.loadValidColumns(),
        this.loadColumns(),
      ])
    }
  }