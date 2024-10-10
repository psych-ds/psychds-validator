import { Schema, GenericSchema } from '../types/schema.ts'
import { objectPathHandler } from '../utils/objectPathHandler.ts'
import { path, readFile, isBrowser, isNode, isDeno } from '../utils/platform.ts';


// Base URLs for fetching schemas
const SCHEMA_BASE_URL = 'https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/versions/jsons';
const SCHEMA_ORG_URL = 'https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/external_schemas/schemaorg/schemaorg.json';

// Default schemas to be used as fallbacks
let defaultSchema: GenericSchema = {};
let defaultSchemaOrg: GenericSchema = {};

/**
 * Loads default schemas from local JSON files or fetches them in browser environment.
 * This function is used to initialize fallback schemas if network requests fail.
 */
async function loadDefaultSchemas(): Promise<void> {
  try {
    if (isBrowser) {
      // In browser, fetch the default schemas
      defaultSchema = await fetchJSON('/defaultSchema.json') || {};
      defaultSchemaOrg = await fetchJSON('/defaultSchemaOrg.json') || {};
    } else {
      // In Node.js or Deno, read from local files
      const dirname = getDirname();
      defaultSchema = JSON.parse(await readFile(path.join(dirname, 'defaultSchema.json')));
      defaultSchemaOrg = JSON.parse(await readFile(path.join(dirname, 'defaultSchemaOrg.json')));
    }
  } catch (error) {
    console.error('Error loading default schemas:', error);
    defaultSchema = {};
    defaultSchemaOrg = {};
  }
}


/**
 * Determines the directory name of the current module.
 * This function handles different JavaScript environments.
 * @returns {string} The directory name of the current module.
 */
function getDirname(): string {
  if (isNode && typeof __dirname !== 'undefined') {
    // CommonJS environment
    return __dirname;
  } else if (isDeno || (isNode && typeof __dirname === 'undefined')) {
    // Deno or Node.js ESM
    const url = new URL(import.meta.url);
    return path.dirname(url.pathname);
  } else {
    // Browser environment
    console.warn('Unable to determine directory in browser environment');
    return '';
  }
}

/**
 * Fetches JSON data from a given URL.
 * @param {string} url - The URL to fetch JSON from.
 * @returns {Promise<GenericSchema | null>} The fetched JSON data or null if the fetch fails.
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
 * Loads the schema from the specification.
 * @param {string} [version='1.4.0'] - The version of the schema to load.
 * @returns {Promise<Schema>} A Promise that resolves to the loaded Schema.
 * @throws {Error} If the version format is invalid.
 */
export async function loadSchema(version = '1.4.0'): Promise<Schema> {
  // Ensure default schemas are loaded
  if (Object.keys(defaultSchema).length === 0 || Object.keys(defaultSchemaOrg).length === 0) {
    await loadDefaultSchemas();
  }

  // Regex to check for X.Y.Z format
  const versionRegex = /^\d+\.\d+\.\d+$/;

  // Validate version format
  if (version !== 'latest' && !versionRegex.test(version)) {
    throw new Error(`Invalid version format. Please use 'latest' or 'X.Y.Z' format (e.g., '1.0.0').`);
  }
  
  const schemaUrl = `${SCHEMA_BASE_URL}/${version}/schema.json`;

  let schemaModule: GenericSchema | null;
  let schemaOrgModule: GenericSchema | null;

  try {
    // Attempt to fetch both the main schema and the schema.org schema
    schemaModule = await fetchJSON(schemaUrl);
    schemaOrgModule = await fetchJSON(`${SCHEMA_ORG_URL}?v=${Date.now()}`);

    // Fall back to default schemas if fetches fail
    if (!schemaModule) {
      console.warn(`Failed to fetch schema from ${schemaUrl}, using default schema`);
      schemaModule = defaultSchema;
    }

    if (!schemaOrgModule) {
      console.warn(`Failed to fetch schemaOrg, using default schemaOrg`);
      schemaOrgModule = defaultSchemaOrg;
    }

    // Combine the schemas
    const combinedSchema: GenericSchema = { ...schemaModule, schemaOrg: schemaOrgModule };

    // Return the combined schema wrapped in a Proxy for dynamic property access
    return new Proxy(combinedSchema, objectPathHandler) as Schema;
  } catch (error) {
    console.error(`Error loading schema: ${error}`);
    console.warn('Falling back to default schema');
    // If all else fails, use the default schemas
    return new Proxy({ ...defaultSchema, schemaOrg: defaultSchemaOrg }, objectPathHandler) as Schema;
  }
}