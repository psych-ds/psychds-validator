import { Schema } from '../types/schema.ts'
import { objectPathHandler } from '../utils/objectPathHandler.ts'
// deno-lint-ignore no-import-assertions
import defaultSchema from '../../default_schema/schema.json' assert { type: 'json' };
/**
 * Load the schema from the specification
 *
 * version is ignored when the network cannot be accessed
 */
export async function loadSchema(version = 'latest'): Promise<Schema> {
  const versionRegex = /\d+.\d+.\d+/
  let schemaUrl = version
  const psychdsSchema =
    typeof Deno !== 'undefined' ? Deno.env.get('psychDS_SCHEMA') : undefined
  const schemaOrgUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/external_schemas/schemaorg/schemaorg.json?v=${Date.now()}`
  if (psychdsSchema !== undefined) {
    schemaUrl = psychdsSchema
  } else if (version === 'latest' || versionRegex.test(version)) {
    schemaUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/versions/jsons/${version}/schema.json?v=${Date.now()}`
  }
  try {
    let schemaModule = await fetch(schemaUrl)
            .then(response => response.text())
            .then(data => JSON.parse(data))
            .catch(error => {
                console.error('Error fetching JSON:', error);
              });
    schemaModule = {...schemaModule}
    const schemaOrgModule = await fetch(schemaOrgUrl)
            .then(response => response.text())
            .then(data => JSON.parse(data))
            .catch(error => {
                console.error('Error fetching JSON:', error);
              });
    schemaModule = {...schemaModule,
      schemaOrg:schemaOrgModule}
    return new Proxy(
      schemaModule as object,
      objectPathHandler,
    ) as Schema
  } catch (error) {
    // No network access or other errors
    console.error(error)
    console.error(
      `Warning, could not load schema from ${schemaUrl}, falling back to internal version`,
    )
    return new Proxy(
      defaultSchema as object,
      objectPathHandler,
    ) as Schema
  }
}
