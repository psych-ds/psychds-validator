/**
 * @fileoverview Core context management for Psych-DS validation.
 * Provides classes for handling dataset and file contexts during validation,
 * including metadata processing, JSON-LD expansion, and CSV validation.
 */

import { Context, ContextDataset } from "../types/context.ts";
import { IssueFile } from "../types/issues.ts";
import { psychDSFile } from "../types/file.ts";
import { FileTree } from "../types/filetree.ts";
import { ColumnsMap } from "../types/columns.ts";
import { readElements } from "./elements.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";
import { csvIssue, parseCSV } from "../files/csv.ts";
import { ValidatorOptions } from "../setup/options.ts";
import { isBrowser, readFile } from "../utils/platform.ts";
import { fetchJSON } from "../setup/loadSchema.ts";

// Global type declarations for JSON-LD library
declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    jsonld: any;
  }
}

/** Generic JSON-LD document type */
export type JsonLdDocument = Record<string, unknown>;

/** Generic JSON-LD node object type */
type NodeObject = Record<string, unknown>;

/**
 * Manages context for an entire dataset during validation
 * Handles dataset-wide metadata and file caching
 */
export class psychDSContextDataset implements ContextDataset {
  /** Dataset description metadata */
  dataset_description: Record<string, unknown>;
  /** Reference to the metadata file */
  metadataFile: psychDSFile;
  /** Validator configuration options */
  options?: ValidatorOptions;
  /** Cache for processed JSON-LD documents */
  sidecarCache: Record<string, JsonLdDocument>;
  /** List of files in the dataset */
  // deno-lint-ignore no-explicit-any
  files: any[];
  /** List of all discovered column headers */
  allColumns: string[];
  /** Base directories found in dataset */
  baseDirs: string[];
  /** File tree structure */
  tree: object;
  /** Ignored files */
  // deno-lint-ignore no-explicit-any
  ignored: any[];

  /**
   * Creates a new dataset context
   * @param options - Validator configuration options
   * @param metadataFile - Dataset metadata file
   * @param description - Dataset description object
   */
  constructor(
    options?: ValidatorOptions,
    metadataFile?: psychDSFile,
    description = {},
  ) {
    this.dataset_description = description;
    this.files = [];
    this.metadataFile = metadataFile as psychDSFile;
    this.baseDirs = [];
    this.sidecarCache = {};
    this.tree = {};
    this.ignored = [];
    this.allColumns = [];
    if (options) {
      this.options = options;
    }
  }
}

/** Default dataset context instance */
const defaultDsContext = new psychDSContextDataset();

/**
 * Manages context for individual files during validation
 * Handles file-specific metadata, validation, and issue tracking
 */
export class psychDSContext implements Context {
  /** File tree reference */
  fileTree: FileTree;
  /** Rules that apply to the filename */
  filenameRules: string[];
  /** Collection of validation issues */
  issues: DatasetIssues;
  /** Current file being validated */
  file: psychDSFile;
  /** Name of file without extension */
  fileName: string;
  /** File extension */
  extension: string;
  /** File name suffix */
  suffix: string;
  /** Base directory containing the file */
  baseDir: string;
  /** Keywords extracted from filename */
  keywords: Record<string, string>;
  /** Reference to dataset context */
  dataset: ContextDataset;
  /** Data type of file */
  datatype: string;
  /** Sidecar metadata */
  sidecar: JsonLdDocument;
  /** Expanded JSON-LD metadata */
  expandedSidecar: object;
  /** CSV column mapping */
  columns: ColumnsMap;
  /** Tracks metadata sources */
  metadataProvenance: Record<string, psychDSFile>;
  /** Suggested column names */
  suggestedColumns: string[];
  /** Valid column names */
  validColumns: string[];

  /**
   * Creates a new file context
   * @param fileTree - File tree containing the file
   * @param file - File to validate
   * @param issues - Issue collection for tracking problems
   * @param dsContext - Optional dataset context
   */
  constructor(
    fileTree: FileTree,
    file: psychDSFile,
    issues: DatasetIssues,
    dsContext?: psychDSContextDataset,
  ) {
    this.fileTree = fileTree;
    this.filenameRules = [];
    this.issues = issues;
    this.file = file;
    this.fileName = file.name.split(".")[0];
    this.baseDir = file.path.split("/").length > 2
      ? file.path.split("/")[1]
      : "/";
    const elements = readElements(file.name);
    this.keywords = elements.keywords;
    this.extension = elements.extension;
    this.suffix = elements.suffix;
    this.dataset = dsContext ? dsContext : defaultDsContext;
    this.datatype = "";
    this.sidecar = dsContext
      ? dsContext.dataset_description as JsonLdDocument
      : {} as JsonLdDocument;
    this.expandedSidecar = {};
    this.validColumns = [];
    this.metadataProvenance = {};
    this.columns = new ColumnsMap();
    this.suggestedColumns = [];
  }

  /** Gets the file's path */
  get path(): string {
    return this.file.path;
  }

  /** Gets the dataset root path */
  get datasetPath(): string {
    return this.fileTree.path;
  }

  /**
   * Loads and processes sidecar metadata files
   * Crawls file tree from root to current file, loading JSON sidecars
   * @param fileTree - Optional specific file tree to process
   */
  async loadSidecar(fileTree?: FileTree) {
    if (!fileTree) {
      fileTree = this.fileTree;
    }
    // Find valid sidecar files
    const validSidecars = fileTree.files.filter((file) => {
      const { suffix, extension } = readElements(file.name);

      return (
        (
          extension === ".json" &&
          suffix === "data" &&
          file.name.split(".")[0] === this.fileName
        ) ||
        (
          extension === ".json" &&
          file.name.split(".")[0] == "file_metadata"
        )
      );
    });

    // Handle multiple matching sidecars
    if (validSidecars.length > 1) {
      const exactMatch = validSidecars.find(
        (sidecar) =>
          sidecar.path == this.file.path.replace(this.extension, ".json"),
      );
      if (exactMatch) {
        validSidecars.splice(1);
        validSidecars[0] = exactMatch;
      }
    }

    // Process sidecar content
    if (validSidecars.length === 1) {
      const validSidecarJson = await validSidecars[0].text()
        .then(JSON.parse);
      this.sidecar = { ...this.sidecar, ...validSidecarJson };

      // Track metadata sources
      Object.keys(validSidecarJson).forEach((key) => {
        const baseKey = key.split("/").at(-1) as string;
        this.metadataProvenance[baseKey] = validSidecars[0];
      });
    }

    // Continue crawling directory tree
    const nextDir = fileTree.directories.find((directory) => {
      return this.file.path.startsWith(directory.path);
    });
    if (nextDir) {
      await this.loadSidecar(nextDir);
    } else {
      // Process JSON-LD expansion
      const jsonString = JSON.stringify(this.sidecar);
      if (jsonString in this.dataset.sidecarCache) {
        this.expandedSidecar = this.dataset.sidecarCache[jsonString];
      } else {
        this.expandedSidecar = await this.getExpandedSidecar();
        this.dataset.sidecarCache[jsonString] = this
          .expandedSidecar as JsonLdDocument;
      }
      this.loadValidColumns();
    }
  }

  /**
   * Extracts valid column names from metadata
   * Used for CSV header validation
   */
  loadValidColumns() {
    if (this.extension !== ".csv") {
      return;
    }
    const nameSpace = "http://schema.org/";
    if (!(`${nameSpace}variableMeasured` in this.expandedSidecar)) {
      return;
    }

    let validColumns: string[] = [];

    for (
      const variable of this
        .expandedSidecar[`${nameSpace}variableMeasured`] as object[]
    ) {
      if ("@value" in variable) {
        validColumns = [...validColumns, variable["@value"] as string];
      } else {
        if (`${nameSpace}name` in variable) {
          const subVar = (variable[`${nameSpace}name`] as object[])[0];
          if ("@value" in subVar) {
            validColumns = [...validColumns, subVar["@value"] as string];
          }
        }
      }
    }
    this.validColumns = validColumns;
  }

  /**
   * Loads and validates CSV column data
   */
  async loadColumns(): Promise<void> {
    if (this.extension !== ".csv") {
      return;
    }
    let result;
    try {
      result = await parseCSV(await this.file.text());
    } catch (_error) {
      result = new Map<string, string[]>() as ColumnsMap;
    }
    this.columns = result["columns"] as ColumnsMap;
    this.reportCSVIssues(result["issues"] as csvIssue[]);
    return;
  }

  /**
   * Records CSV validation issues
   * @param issues - Array of CSV validation issues
   */
  reportCSVIssues(issues: csvIssue[]) {
    issues.forEach((issue) => {
      if (issue.message) {
        this.issues.addSchemaIssue(
          issue.issue,
          [{ ...this.file, evidence: issue.message as string }],
        );
      } else {
        this.issues.addSchemaIssue(
          issue.issue,
          [this.file],
        );
      }
    });
  }

  /**
   * Expands JSON-LD metadata with full context
   * Handles cross-platform JSON-LD processing
   * @returns Expanded JSON-LD document
   */
  async getExpandedSidecar(): Promise<NodeObject> {
    // Load JSON-LD library
    // deno-lint-ignore no-explicit-any
    let jsonld: any;
    if (!isBrowser) {
      const jsonldModule = await import("npm:jsonld");
      jsonld = jsonldModule.default;
    }
    // deno-lint-ignore no-explicit-any
    const jsonldToUse = isBrowser ? (window as any).jsonld : jsonld;

    // Custom document loader for schema.org context
    const customDocumentLoader = async (url: string) => {
      if (
        url.startsWith("http://schema.org/") ||
        url.startsWith("https://schema.org/")
      ) {
        const safeSchemaUrl =
          "https://schema.org/version/latest/schemaorg-current-https.jsonld";
        try {
          const response = await fetch(safeSchemaUrl);
          const context = await response.json();
          return {
            contextUrl: null,
            document: context,
            documentUrl: url,
          };
        } catch (_error) {
          // Handle offline fallbacks
          if (isBrowser) {
            try {
              const context = await fetchJSON("/defaultSchemaOrgJsonLD.json") ||
                {};
              return {
                contextUrl: null,
                document: context,
                documentUrl: url,
              };
            } catch (error) {
              console.log(error);
            }
          } else {
            const context = JSON.parse(
              await readFile("../setup/defaultSchemaOrgJsonLD.json"),
            );
            return {
              contextUrl: null,
              document: context,
              documentUrl: url,
            };
          }
        }
      }
      return jsonldToUse.documentLoaders.node()(url);
    };

    try {
      // Validate JSON-LD context
      if (!("@context" in this.sidecar) && this.dataset.metadataFile) {
        try {
          this.issues.add({
            key: "INVALID_JSONLD_FORMATTING",
            reason:
              `Metadata files must follow JSON-LD syntax, which means, among other things, that a @context field must be included.`,
            severity: "error",
            files: [this.dataset.metadataFile],
          });
        } catch (error) {
          console.log(error);
        }
        return {};
      }
      const schemaForms = [
        "http://schema.org/",
        "http://schema.org",
        "http://www.schema.org/",
        "http://www.schema.org",
        "https://schema.org/",
        "https://schema.org",
        "https://www.schema.org/",
        "https://www.schema.org/",
      ];
      if(
        "@context" in this.sidecar && 
        Array.isArray(this.sidecar["@context"]) &&
        schemaForms.includes(this.sidecar["@context"][0])
      ) {
        this.sidecar["@context"] = this.sidecar["@context"][0]
      }

      // Handle schema.org context normalization
      if (
        "@context" in this.sidecar &&
        typeof this.sidecar["@context"] == "string" &&
        schemaForms.includes(this.sidecar["@context"])
      ) {
        this.sidecar["@context"] = {
          "@vocab": "http://schema.org/",
        };
      }
      // Expand JSON-LD document
      const exp = await jsonldToUse.expand(this.sidecar, {
        documentLoader: customDocumentLoader,
      });
      return exp[0] || {};
    } catch (error) {
      // Handle JSON-LD processing errors
      const issueFile = {
        ...this.file,
        // deno-lint-ignore no-explicit-any
        evidence: JSON.stringify((error as unknown as any).details.context),
      } as IssueFile;
      this.issues.add({
        key: "INVALID_JSONLD_FORMATTING",
        // deno-lint-ignore no-explicit-any
        reason: `${(error as unknown as any).message.split(";")[1]}`,
        severity: "error",
        files: [issueFile],
      });
      return {};
    }
  }

  /**
   * Performs all asynchronous loading operations
   * Loads sidecar metadata and CSV columns in parallel
   */
  async asyncLoads() {
    await Promise.allSettled([
      this.loadSidecar(),
      this.loadColumns(),
    ]);
  }
}
