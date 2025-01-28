/**
 * @fileoverview Manages schema loading and versioning for the Psych-DS validator.
 * Handles fetching and combining schemas from remote sources with fallback mechanisms
 * for offline or error scenarios. Supports multiple JavaScript environments including
 * browser, Node.js, and Deno.
 */

import { GenericSchema, Schema } from "../types/schema.ts";
import { objectPathHandler } from "../utils/objectPathHandler.ts";
import {
  isBrowser,
  isDeno,
  isNode,
  path,
  readFile,
} from "../utils/platform.ts";

/** Base URL for fetching version-specific schema files */
const SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/psych-ds/psych-DS/master/schema_model/versions/jsons";

/** URL for fetching the Schema.org definitions */
const SCHEMA_ORG_URL =
  "https://raw.githubusercontent.com/psych-ds/psych-DS/master/schema_model/external_schemas/schemaorg/schemaorg.json";

/** Default schema storage for fallback scenarios */
let defaultSchema: GenericSchema = {};
let defaultSchemaOrg: GenericSchema = {};

/**
 * Loads default schemas from appropriate sources based on environment.
 * In browser environments, fetches from static URLs.
 * In Node.js/Deno environments, reads from local filesystem.
 *
 * @throws {Error} Logs error and sets empty defaults if loading fails
 */
async function loadDefaultSchemas(): Promise<void> {
  try {
    if (isBrowser) {
      defaultSchema = await fetchJSON("/defaultSchema.json") || {};
      defaultSchemaOrg = await fetchJSON("/defaultSchemaOrg.json") || {};
    } else {
      const dirname = getDirname();
      defaultSchema = JSON.parse(
        await readFile(path.join(dirname, "defaultSchema.json")),
      );
      defaultSchemaOrg = JSON.parse(
        await readFile(path.join(dirname, "defaultSchemaOrg.json")),
      );
    }
  } catch (error) {
    console.error("Error loading default schemas:", error);
    defaultSchema = {};
    defaultSchemaOrg = {};
  }
}

/**
 * Gets the current module's directory path across different environments
 * Handles path resolution for CommonJS, ES Modules, and Deno
 *
 * @returns Directory path string, or empty string if unable to determine
 */
function getDirname(): string {
  if (isNode && typeof __dirname !== "undefined") {
    // CommonJS environment
    return __dirname;
  } else if (isDeno || (isNode && typeof __dirname === "undefined")) {
    // Deno or Node.js ESM
    const url = new URL(import.meta.url);
    return path.dirname(url.pathname);
  } else {
    console.warn("Unable to determine directory in browser environment");
    return "";
  }
}

/**
 * Fetches and parses JSON from a URL
 * Includes error handling and logging for failed requests
 *
 * @param url - URL to fetch JSON from
 * @returns Parsed JSON data, or null if fetch/parse fails
 */
export async function fetchJSON(url: string): Promise<GenericSchema | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json() as GenericSchema;
  } catch (error) {
    console.error(`Error fetching JSON from ${url}:`, error);
    return null;
  }
}

/**
 * Loads and combines the Psych-DS schema for the specified version
 *
 * @param version - Schema version to load (defaults to 'latest')
 * @returns Promise resolving to complete Schema object
 * @throws {Error} If version format is invalid
 */
export async function loadSchema(version = "latest"): Promise<Schema> {
  // Ensure default schemas are loaded
  if (
    Object.keys(defaultSchema).length === 0 ||
    Object.keys(defaultSchemaOrg).length === 0
  ) {
    await loadDefaultSchemas();
  }

  // Validate version format using X.Y.Z pattern
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (version !== "latest" && !versionRegex.test(version)) {
    throw new Error(
      `Invalid version format. Please use 'latest' or 'X.Y.Z' format (e.g., '1.0.0').`,
    );
  }

  const schemaUrl = `${SCHEMA_BASE_URL}/${version}/schema.json`;

  let schemaModule: GenericSchema | null;
  let schemaOrgModule: GenericSchema | null;

  try {
    // Fetch both schema components
    schemaModule = await fetchJSON(schemaUrl);
    schemaOrgModule = await fetchJSON(`${SCHEMA_ORG_URL}?v=${Date.now()}`);

    // Handle fetch failures with fallbacks
    if (!schemaModule) {
      console.warn(
        `Failed to fetch schema from ${schemaUrl}, using default schema`,
      );
      schemaModule = defaultSchema;
    }

    if (!schemaOrgModule) {
      console.warn(`Failed to fetch schemaOrg, using default schemaOrg`);
      schemaOrgModule = defaultSchemaOrg;
    }

    // Combine schemas and wrap in Proxy
    const combinedSchema: GenericSchema = {
      ...schemaModule,
      schemaOrg: schemaOrgModule,
    };

    return new Proxy(combinedSchema, objectPathHandler) as Schema;
  } catch (error) {
    console.error(`Error loading schema: ${error}`);
    console.warn("Falling back to default schema");

    // Ultimate fallback using default schemas
    return new Proxy(
      { ...defaultSchema, schemaOrg: defaultSchemaOrg },
      objectPathHandler,
    ) as Schema;
  }
}
