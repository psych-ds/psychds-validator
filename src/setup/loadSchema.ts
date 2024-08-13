import { Schema, GenericSchema } from '../types/schema.ts'
import { objectPathHandler } from '../utils/objectPathHandler.ts'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestInfo, RequestInit, Response } from 'npm:node-fetch';

/**
 * Dynamically import and use node-fetch for making HTTP requests.
 * This approach allows for better compatibility across different JavaScript environments.
 */
const fetch = async (...args: [RequestInfo, RequestInit?]): Promise<Response> => {
  const { default: nodeFetch } = await import('npm:node-fetch');
  return nodeFetch(...args);
};

/**
 * Determines the directory name of the current module.
 * This function handles both CommonJS and ES Module environments.
 * @returns {string} The directory name of the current module.
 */
function getDirname(): string {
  if (typeof __dirname !== 'undefined') {
    // CommonJS environment
    return __dirname;
  } else {
    // ES Module environment or unknown
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch (error) {
      console.warn('Unable to determine directory:', error);
      return '';
    }
  }
}

const dirname = getDirname();

// Base URLs for fetching schemas
const SCHEMA_BASE_URL = 'https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/versions/jsons';
const SCHEMA_ORG_URL = 'https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/external_schemas/schemaorg/schemaorg.json';

// Default schemas to be used as fallbacks
let defaultSchema: GenericSchema = {};
let defaultSchemaOrg: GenericSchema = {};

/**
 * Loads default schemas from local JSON files.
 * This function is used to initialize fallback schemas if network requests fail.
 */
function loadDefaultSchemas(): void {
  try {
    defaultSchema = JSON.parse(fs.readFileSync(path.join(dirname, 'defaultSchema.json'), 'utf-8'));
    defaultSchemaOrg = JSON.parse(fs.readFileSync(path.join(dirname, 'defaultSchemaOrg.json'), 'utf-8'));
  } catch (error) {
    console.error('Error loading default schemas:', error);
    defaultSchema = {};
    defaultSchemaOrg = {};
  }
}

/**
 * Fetches JSON data from a given URL.
 * @param {string} url - The URL to fetch JSON from.
 * @returns {Promise<GenericSchema | null>} The fetched JSON data or null if the fetch fails.
 */
async function fetchJSON(url: string): Promise<GenericSchema | null> {
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
 * This function has been significantly refactored from the old version:
 * - It now uses a more robust version checking mechanism.
 * - It implements better error handling and fallback mechanisms.
 * - It separates concerns by using helper functions (fetchJSON, loadDefaultSchemas).
 * 
 * @param {string} [version='latest'] - The version of the schema to load.
 * @returns {Promise<Schema>} A Promise that resolves to the loaded Schema.
 * @throws {Error} If the version format is invalid.
 */
export async function loadSchema(version = 'latest'): Promise<Schema> {
  // Ensure default schemas are loaded
  if (Object.keys(defaultSchema).length === 0 || Object.keys(defaultSchemaOrg).length === 0) {
    loadDefaultSchemas();
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