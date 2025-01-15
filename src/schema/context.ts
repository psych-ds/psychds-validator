import {
    Context,
    ContextDataset
  } from '../types/context.ts'
  import { IssueFile } from '../types/issues.ts'
  import { psychDSFile } from '../types/file.ts'
  import { FileTree } from '../types/filetree.ts'
  import { ColumnsMap } from '../types/columns.ts'
  import { readElements } from './elements.ts'
  import { DatasetIssues } from '../issues/datasetIssues.ts'
  import { parseCSV,csvIssue } from '../files/csv.ts'
  import { ValidatorOptions } from '../setup/options.ts'
  import { isBrowser, readFile } from '../utils/platform.ts'
  import { fetchJSON } from '../setup/loadSchema.ts'

  // TypeScript type declaration for jsonld
  declare global {
    interface Window {
      // deno-lint-ignore no-explicit-any
      jsonld: any;
    }
  }

  // Define JsonLdDocument type
  export type JsonLdDocument = Record<string, unknown>;

  // Define NodeObject type
  type NodeObject = Record<string, unknown>;


  
  export class psychDSContextDataset implements ContextDataset {
    dataset_description: Record<string, unknown>
    metadataFile: psychDSFile
    options?: ValidatorOptions
    sidecarCache: Record<string,JsonLdDocument>
    // deno-lint-ignore no-explicit-any
    files: any[]
    baseDirs: string[]
    tree: object
    // deno-lint-ignore no-explicit-any
    ignored: any[]
  
    constructor(options?: ValidatorOptions, metadataFile?: psychDSFile,description = {}) {
      this.dataset_description = description
      this.files = []
      this.metadataFile = metadataFile as psychDSFile
      this.baseDirs = []
      this.sidecarCache = {}
      this.tree = {}
      this.ignored = []
      if (options) {
        this.options = options
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
    sidecar: JsonLdDocument
    expandedSidecar: object
    columns: ColumnsMap
    metadataProvenance: Record<string, psychDSFile>
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
      this.sidecar = dsContext ? dsContext.dataset_description as JsonLdDocument : {} as JsonLdDocument;
      this.expandedSidecar = {}
      this.validColumns = []
      this.metadataProvenance = {}
      this.columns = new ColumnsMap()
      this.suggestedColumns = []
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
            suffix === "data" &&
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
        } 
      }
  
      if (validSidecars.length === 1) {
        const validSidecarJson = await validSidecars[0].text()
          .then(JSON.parse)
        this.sidecar = { ...this.sidecar, ...validSidecarJson }
        //keep record of which keys in the metadata object came from which file, 
        //so they can be properly identified when issues arise
        Object.keys(validSidecarJson).forEach((key) => {
          const baseKey = key.split('/').at(-1) as string
          this.metadataProvenance[baseKey] = validSidecars[0]
        })
      }
      const nextDir = fileTree.directories.find((directory) => {
        return this.file.path.startsWith(directory.path)
      })
      if (nextDir) {
        await this.loadSidecar(nextDir)
      }
      else{

        //moved getExpandedSidecar to the end of loadSidecar since it is asyncronous, subsequent to 
        //the content of loadSidecar, and necessary for loadValidColumns. previous implementation had them
        //all running in parallel, which caused issues.
        const jsonString = JSON.stringify(this.sidecar)
        if (jsonString in this.dataset.sidecarCache){
          this.expandedSidecar = this.dataset.sidecarCache[jsonString]
        }
        else{
          this.expandedSidecar = await this.getExpandedSidecar()
          this.dataset.sidecarCache[jsonString] = this.expandedSidecar as JsonLdDocument
        }
        this.loadValidColumns()
      }
    }
  
    // get validColumns from metadata sidecar
    // used to determined which columns can/must appear within csv headers
    loadValidColumns() {
        if (this.extension !== '.csv') {
            return
          }
        //TODO:possibly redundant (could maybe be stored in one place)
        const nameSpace = "http://schema.org/"
        //if there's no variableMeasured property, then the valid column headers cannot be determined
        if(!(`${nameSpace}variableMeasured`in this.expandedSidecar)){
            return
        }
        
        let validColumns :string[] = []

        for(const variable of this.expandedSidecar[`${nameSpace}variableMeasured`] as object[]){
            //jsonld.expand turns string values in json into untyped objects with @value keys
            if('@value' in variable)
              validColumns = [...validColumns,variable['@value'] as string]
            else{
              if(`${nameSpace}name` in variable){
                const subVar = (variable[`${nameSpace}name`] as object[])[0]
                if('@value' in subVar)
                  validColumns = [...validColumns,subVar['@value'] as string]
              }
              //TODO: find most logical way to throw error when PropertyValue object 
              // does not have "name" as a property. Ideally, should also detect whether the 
              // object IS a PropertyValue or one of its subclasses. may need to locate this 
              // whole function downstream of schemaCheck for this reason
            }
        }
        this.validColumns = validColumns
    }
  
    // get columns from csv file
    async loadColumns(): Promise<void> {
      if (this.extension !== '.csv') {
        return
      }
      let result
      try{
        result = await parseCSV(await this.file.text())
      }
      catch(_error){
        
        result = new Map<string, string[]>() as ColumnsMap
      }
      this.columns = result['columns'] as ColumnsMap
      this.reportCSVIssues(result['issues'] as csvIssue[])
      return
    }
    
    //multiple CSV issues are possible, so these are unpacked from the issue object
    reportCSVIssues(issues: csvIssue[]){
      issues.forEach((issue) => {
        if (issue.message){
          this.issues.addSchemaIssue(
            issue.issue,
            [{...this.file,
              evidence: issue.message as string
            }]
          )
        }
        else{
          this.issues.addSchemaIssue(
            issue.issue,
            [this.file]
          )
        }
        
      })
    }
    
    async getExpandedSidecar(): Promise<NodeObject>{
      // deno-lint-ignore no-explicit-any
      let jsonld: any;
      if (!isBrowser) {
        const jsonldModule = await import('npm:jsonld');
        jsonld = jsonldModule.default;
      }
      // deno-lint-ignore no-explicit-any
      const jsonldToUse = isBrowser ? (window as any).jsonld : jsonld;

      const customDocumentLoader = async (url: string) => {
        if (url.startsWith('http://schema.org/') || url.startsWith('https://schema.org/')) {
          // Use a specific version of the schema.org context
          const safeSchemaUrl = 'https://schema.org/version/latest/schemaorg-current-https.jsonld';
          try {
            const response = await fetch(safeSchemaUrl);
            const context = await response.json();
            return {
              contextUrl: null,
              document: context,
              documentUrl: url
            };
          }
          catch(_error){
            if(isBrowser){
              try{
                const context = await fetchJSON('/defaultSchemaOrgJsonLD.json') || {};
                return {
                  contextUrl: null,
                  document: context,
                  documentUrl: url
                };

              }
              catch(error){
                console.log(error)
              }
            }
            else{
              const context = JSON.parse(await readFile('../setup/defaultSchemaOrgJsonLD.json'));
              return {
                contextUrl: null,
                document: context,
                documentUrl: url
              };
            }
            
          }
          
        }
        // For all other URLs, use the default document loader
        return jsonldToUse.documentLoaders.node()(url);
      };

      try{
        //account for possibility of both http and https in metadata context
        if(!('@context' in this.sidecar) && this.dataset.metadataFile){
          try{
            this.issues.add({
              key:'INVALID_JSONLD_FORMATTING',
              reason:`Metadata files must follow JSON-LD syntax, which means, among other things, that a @context field must be included.`,
              severity:'error',
              files:[this.dataset.metadataFile]
            })
          }
          catch(error){
            console.log(error)
          }
          
          return {}
        }

        const expandOptions = {
          documentLoader: customDocumentLoader
        };
        //use the jsonld library to expand metadata json and remove context.
        //in addition to adding the appropriate namespace (e.g. http://schema.org)
        //to all keys within the json, it also throws a variety of errors for improper JSON-LD syntax,
        //which mostly all pertain to improper usages of privileged @____ keywords
        if ('@context' in this.sidecar){
          
          if (Array.isArray(this.sidecar['@context']) && this.sidecar['@context'].length === 1){
            this.sidecar['@context'] = this.sidecar['@context'][0]
          }

          if (typeof this.sidecar['@context'] == 'string' && ['http://schema.org/','http://schema.org','http://www.schema.org/','http://www.schema.org','https://schema.org/','https://schema.org','https://www.schema.org/','https://www.schema.org/'].includes(this.sidecar['@context'])){
            this.sidecar['@context'] = {
              '@vocab':'http://schema.org/'
            }
          }
        }

        const exp = await jsonldToUse.expand(this.sidecar,expandOptions)
        return exp[0] || {};
      }
      catch(error){
        //format thrown error and pipe into validator issues
        const issueFile = {
          ...this.file,
          evidence:JSON.stringify(error.details.context)
        } as IssueFile
        this.issues.add({
          key:'INVALID_JSONLD_FORMATTING',
          reason:`${error.message.split(';')[1]}`,
          severity:'error',
          files:[issueFile]
        })
        return {}
      }
    }
  
    async asyncLoads() {
      await Promise.allSettled([
        this.loadSidecar(),
        this.loadColumns(),
      ])
    }
  }