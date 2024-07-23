// src/deps/logger.ts
import {
  Logger,
  LogLevels,
  error,
  critical,
  debug,
  info,
  setup,
  warning,
  handlers,
  getLogger
} from "https://deno.land/std@0.177.0/log/mod.ts";
import { LogLevelNames } from "https://deno.land/std@0.177.0/log/levels.ts";

// src/deps/cliffy.ts
import {
  Cell,
  Row,
  Table
} from "https://deno.land/x/cliffy@v0.25.7/table/mod.ts";
import {
  Command,
  EnumType
} from "https://deno.land/x/cliffy@v0.25.7/command/mod.ts";

// src/setup/options.ts
async function parseOptions(argumentOverride = Deno.args) {
  const { args, options } = await new Command().name("psychds-validator").type("debugLevel", new EnumType(LogLevelNames)).description(
    "This tool checks if a dataset in a given directory is compatible with the psych-DS specification. To learn more about psych-DS visit https://psych-ds.github.io/"
  ).arguments("<dataset_directory>").version("alpha").option("--json", "Output machine readable JSON").option(
    "-s, --schema <type:string>",
    "Specify a schema version to use for validation",
    {
      default: "latest"
    }
  ).option("-v, --verbose", "Log more extensive information about issues").option("--debug <type:debugLevel>", "Enable debug output", {
    default: "ERROR"
  }).option(
    "-w, --showWarnings",
    "Include warnings and suggestions in addition to errors"
  ).parse(argumentOverride);
  return {
    datasetPath: args[0],
    ...options,
    debug: options.debug
  };
}

// src/utils/logger.ts
function setupLogging(level) {
  setup({
    handlers: {
      console: new handlers.ConsoleHandler(level)
    },
    loggers: {
      "@psychds/validator": {
        level,
        handlers: ["console"]
      }
    }
  });
}
function parseStack(stack) {
  const lines = stack.split("\n");
  const caller = lines[2].trim();
  const token = caller.split("at ");
  return token[1];
}
var loggerProxyHandler = {
  // deno-lint-ignore no-explicit-any
  get: function(_, prop) {
    const logger2 = getLogger("@psychds/validator");
    const stack = new Error().stack;
    if (stack) {
      const callerLocation = parseStack(stack);
      logger2.debug(`Logger invoked at "${callerLocation}"`);
    }
    const logFunc = logger2[prop];
    return logFunc.bind(logger2);
  }
};
var logger = new Proxy(getLogger("@psychds/validator"), loggerProxyHandler);

// src/deps/path.ts
import {
  relative,
  resolve,
  join,
  basename,
  dirname,
  extname,
  fromFileUrl,
  parse
} from "https://deno.land/std@0.177.0/path/mod.ts";
import { SEP } from "https://deno.land/std@0.177.0/path/separator.ts";

// src/validators/internal/emptyFile.ts
var emptyFile = (_schema, context) => {
  if (context.file.size === 0) {
    context.issues.addSchemaIssue("EmptyFile", [context.file]);
  }
  return Promise.resolve();
};

// src/validators/filenameIdentify.ts
var CHECKS = [
  findRuleMatches
];
async function filenameIdentify(schema, context) {
  for (const check of CHECKS) {
    await check(schema, context);
  }
}
function checkDirRules(schema, rulesRecord, baseDirs) {
  Object.keys(rulesRecord).filter((key) => {
    return key.startsWith("rules.files.common.core") && !rulesRecord[key];
  }).map((key) => {
    const node = schema[key];
    if (node.directory === true && baseDirs.includes(node.path))
      rulesRecord[key] = true;
  });
}
function findFileRules(schema, rulesRecord) {
  const schemaPath = "rules.files";
  Object.keys(schema[schemaPath]).map((key) => {
    const path = `${schemaPath}.${key}`;
    _findFileRules(schema[path], path, rulesRecord);
  });
  return Promise.resolve();
}
function _findFileRules(node, path, rulesRecord) {
  if ("baseDir" in node && "extensions" in node && ("suffix" in node || "stem" in node)) {
    rulesRecord[path] = false;
    return;
  }
  if ("path" in node && "directory" in node) {
    rulesRecord[path] = false;
    return;
  } else {
    Object.keys(node).map((key) => {
      if (typeof node[key] === "object") {
        _findFileRules(node[key], `${path}.${key}`, rulesRecord);
      }
    });
  }
}
function findRuleMatches(schema, context) {
  const schemaPath = "rules.files";
  Object.keys(schema[schemaPath]).map((key) => {
    const path = `${schemaPath}.${key}`;
    _findRuleMatches(schema[path], path, context);
  });
  if (context.filenameRules.length === 0 && context.file.path !== "/.bidsignore") {
    context.issues.addSchemaIssue("NotIncluded", [context.file]);
    if (context.file.name === "dataset_description.json") {
      context.issues.addSchemaIssue(
        "WrongMetadataLocation",
        [context.file],
        `You have placed a file called "dataset_description.json" within the ${context.baseDir} 
        subDirectory. Such files are only valid when placed in the root directory.`
      );
    }
  }
  return Promise.resolve();
}
function checkFileRules(arbitraryNesting, hasSuffix, node, context) {
  let baseDirCond = null;
  let suffixStemCond = null;
  if (arbitraryNesting)
    baseDirCond = context.baseDir === node.baseDir;
  else {
    if (context.baseDir === "/")
      baseDirCond = context.path === `/${context.file.name}`;
    else
      baseDirCond = context.path === `/${node.baseDir}/${context.file.name}`;
  }
  if (hasSuffix)
    suffixStemCond = context.suffix === node.suffix;
  else
    suffixStemCond = context.file.name.startsWith(node.stem);
  if (baseDirCond && node.extensions.includes(context.extension) && suffixStemCond)
    return true;
  else
    return false;
}
function _findRuleMatches(node, path, context) {
  if ("arbitraryNesting" in node) {
    if (checkFileRules(node.arbitraryNesting, "suffix" in node, node, context)) {
      context.filenameRules.push(path);
      return;
    }
  } else {
    Object.keys(node).map((key) => {
      if (typeof node[key] === "object") {
        _findRuleMatches(node[key], `${path}.${key}`, context);
      }
    });
  }
}

// src/types/issues.ts
var Issue = class {
  key;
  severity;
  reason;
  requires;
  files;
  constructor({
    key,
    severity,
    reason,
    requires,
    files
  }) {
    this.key = key;
    this.severity = severity;
    this.reason = reason;
    this.requires = requires;
    if (Array.isArray(files)) {
      this.files = /* @__PURE__ */ new Map();
      for (const f of files) {
        this.files.set(f.path, f);
      }
    } else {
      this.files = files;
    }
  }
  get helpUrl() {
    return `https://neurostars.org/search?q=${this.key}`;
  }
};

// src/issues/datasetIssues.ts
var CODE_DEPRECATED = Number.MIN_SAFE_INTEGER;
var issueFile = (issue, f) => {
  const evidence = f.evidence || "";
  const reason = issue.reason || "";
  const line = f.line || 0;
  const character = f.character || 0;
  return {
    key: issue.key,
    code: CODE_DEPRECATED,
    file: { path: f.path, name: f.name, relativePath: f.path },
    evidence,
    line,
    character,
    severity: issue.severity,
    reason,
    helpUrl: issue.helpUrl
  };
};
var DatasetIssues = class extends Map {
  //added optional schema hook so addSchemaIssue can reference the error list from schema model
  schema;
  constructor(schema) {
    super();
    this.schema = schema ? schema : {};
  }
  add({
    key,
    reason,
    severity = "error",
    requires = [],
    files = []
  }) {
    const existingIssue = this.get(key);
    if (existingIssue) {
      for (const f of files) {
        existingIssue.files.set(f.path, f);
      }
      return existingIssue;
    } else {
      const newIssue = new Issue({
        key,
        severity,
        reason,
        requires,
        files
      });
      this.set(key, newIssue);
      return newIssue;
    }
  }
  // Shorthand to test if an issue has occurred
  hasIssue({ key }) {
    if (this.has(key)) {
      return true;
    }
    return false;
  }
  //adds issue from errors.yaml file of schema model
  addSchemaIssue(key, files) {
    if (this.schema) {
      this.add({
        key: this.schema[`rules.errors.${key}.code`],
        reason: this.schema[`rules.errors.${key}.reason`],
        severity: this.schema[`rules.errors.${key}.level`],
        requires: this.schema[`rules.errors.${key}.requires`],
        files
      });
    }
  }
  fileInIssues(path) {
    const matchingIssues = [];
    for (const [_, issue] of this) {
      if (issue.files.get(path)) {
        matchingIssues.push(issue);
      }
    }
    return matchingIssues;
  }
  /**
   * Report Issue keys related to a file
   * @param path File path relative to dataset root
   * @returns Array of matching issue keys
   */
  getFileIssueKeys(path) {
    return this.fileInIssues(path).map((issue) => issue.key);
  }
  //removes any issues that pertain to objects that were not founds
  filterIssues(rulesRecord) {
    for (const [_, issue] of this) {
      if (!issue.requires.every((req) => rulesRecord[req])) {
        this.delete(_);
      }
    }
  }
  /**
   * Format output
   *
   * Converts from new internal representation to old IssueOutput structure
   */
  formatOutput() {
    const output = {
      errors: [],
      warnings: []
    };
    for (const [_, issue] of this) {
      const outputIssue = {
        severity: issue.severity,
        key: issue.key,
        code: CODE_DEPRECATED,
        additionalFileCount: 0,
        reason: issue.reason,
        files: Array.from(issue.files.values()).map((f) => issueFile(issue, f)),
        helpUrl: issue.helpUrl
      };
      if (issue.severity === "warning") {
        output.warnings.push(outputIssue);
      } else {
        output.errors.push(outputIssue);
      }
    }
    return output;
  }
};

// src/validators/filenameValidate.ts
var CHECKS2 = [
  checkRules
];
async function filenameValidate(schema, context) {
  for (const check of CHECKS2) {
    await check(schema, context);
  }
  return Promise.resolve();
}
var ruleChecks = [
  extensionMismatch,
  keywordCheck
];
function checkRules(schema, context) {
  if (context.filenameRules.length === 1) {
    for (const check of ruleChecks) {
      check(
        context.filenameRules[0],
        schema,
        context
      );
    }
  } else {
    const ogIssues = context.issues;
    const noIssues = [];
    const someIssues = [];
    for (const path of context.filenameRules) {
      const tempIssues = new DatasetIssues();
      context.issues = tempIssues;
      for (const check of ruleChecks) {
        check(path, schema, context);
      }
      tempIssues.size ? someIssues.push([path, tempIssues]) : noIssues.push([path, tempIssues]);
    }
    if (noIssues.length) {
      context.issues = ogIssues;
      context.filenameRules = [noIssues[0][0]];
    } else if (someIssues.length) {
      context.issues = ogIssues;
      context.issues.addSchemaIssue("AllFilenameRulesHaveIssues", [
        {
          ...context.file,
          evidence: `Rules that matched with issues: ${someIssues.map((x) => x[0]).join(", ")}`
        }
      ]);
    }
  }
  return Promise.resolve();
}
function extensionMismatch(path, schema, context) {
  const rule = schema[path];
  if (Array.isArray(rule.extensions) && !rule.extensions.includes(context.extension)) {
    context.issues.addSchemaIssue("ExtensionMismatch", [
      { ...context.file, evidence: `Rule: ${path}` }
    ]);
  }
}
function keywordCheck(path, schema, context) {
  const rule = schema[path];
  if ("usesKeywords" in rule && rule.usesKeywords) {
    if ("fileRegex" in rule) {
      const fileRegex = new RegExp(rule.fileRegex);
      const regexMatch = context.file.name.match(fileRegex);
      if (regexMatch && regexMatch[0] !== context.file.name || !regexMatch) {
        context.issues.addSchemaIssue(
          "KeywordFormattingError",
          [context.file]
        );
      }
    }
    if (!Object.keys(context.keywords).every((keyword) => keyword in schema["meta.context.context.properties.keywords.properties"])) {
      context.issues.addSchemaIssue(
        "UnofficialKeywordWarning",
        [context.file]
      );
    }
  }
}
function checkMissingRules(schema, rulesRecord, issues) {
  Object.keys(rulesRecord).filter((key) => {
    return rulesRecord[key] === false;
  }).map((key) => {
    const node = schema[key];
    issues.add({
      key: node.code,
      reason: node.reason,
      severity: node.level
    });
  });
}

// src/utils/memoize.ts
var memoize = (fn) => {
  const cache = /* @__PURE__ */ new Map();
  const cached = function(val) {
    return cache.has(val) ? cache.get(val) : cache.set(val, fn.call(this, val)) && cache.get(val);
  };
  cached.cache = cache;
  return cached;
};

// src/schema/applyRules.ts
function applyRules(schema, context, rootSchema, schemaPath) {
  if (!rootSchema) {
    rootSchema = schema;
  }
  if (!schemaPath) {
    schemaPath = "schema";
  }
  for (const key in schema) {
    if (!(schema[key].constructor === Object)) {
      continue;
    }
    if ("selectors" in schema[key]) {
      evalRule(
        schema[key],
        context,
        rootSchema,
        `${schemaPath}.${key}`
      );
    } else if (schema[key].constructor === Object) {
      applyRules(
        schema[key],
        context,
        rootSchema,
        `${schemaPath}.${key}`
      );
    }
  }
  return Promise.resolve();
}
var evalConstructor = (src) => new Function("context", `with (context) { return ${src} }`);
var safeHas = () => true;
var safeGet = (target, prop) => prop === Symbol.unscopables ? void 0 : target[prop];
var memoizedEvalConstructor = memoize(evalConstructor);
function evalCheck(src, context) {
  const test = memoizedEvalConstructor(src);
  const safeContext = new Proxy(context, { has: safeHas, get: safeGet });
  try {
    return test(safeContext);
  } catch (error2) {
    logger.debug(error2);
    return false;
  }
}
var evalMap = {
  columnsMatchMetadata: evalColumns,
  fields: evalJsonCheck
};
function evalRule(rule, context, schema, schemaPath) {
  if (rule.selectors && !mapEvalCheck(rule.selectors, context)) {
    return;
  }
  Object.keys(rule).filter((key) => key in evalMap).map((key) => {
    evalMap[key](rule, context, schema, schemaPath);
  });
}
function mapEvalCheck(statements, context) {
  return statements.every((x) => evalCheck(x, context));
}
function evalColumns(_rule, context, schema, schemaPath) {
  if (context.extension !== ".csv")
    return;
  const headers = [...Object.keys(context.columns)];
  let invalidHeaders = [];
  for (const header of headers) {
    if (!context.validColumns.includes(header)) {
      invalidHeaders = [...invalidHeaders, header];
    }
  }
  if (invalidHeaders.length != 0) {
    context.issues.addSchemaIssue("CsvColumnMissing", [
      {
        ...context.file,
        evidence: `Column headers: [${invalidHeaders}] do not appear in variableMeasured. ${schemaPath}`
      }
    ]);
  }
  const schemaOrgIssues = {
    "termIssues": [],
    "unknownNamespaceIssues": [],
    "typeIssues": [],
    "typeMissingIssues": []
  };
  schemaCheck(
    context,
    schema,
    schemaOrgIssues
  );
}
function evalJsonCheck(rule, context, _schema, schemaPath) {
  const issueKeys = [];
  for (const [key, requirement] of Object.entries(rule.fields)) {
    const severity = getFieldSeverity(requirement, context);
    const keyName = `${rule.namespace}${key}`;
    if (severity && severity !== "ignore" && !(keyName in context.sidecar)) {
      if (requirement.issue?.code && requirement.issue?.message) {
        context.issues.add({
          key: requirement.issue.code,
          reason: requirement.issue.message,
          severity,
          files: [{ ...context.file }]
        });
      } else {
        issueKeys.push(key);
      }
    }
  }
  if (issueKeys.length != 0) {
    context.issues.addSchemaIssue("JsonKeyRequired", [
      {
        ...context.file,
        evidence: `metadata object missing fields: [${issueKeys}] as per ${schemaPath}. 
                    If these fields appear to be present in your metadata, then there may be an issue with your schema.org context`
      }
    ]);
  }
}
function schemaCheck(context, schema, issues) {
  const schemaNamespace = "http://schema.org/";
  if ("@type" in context.sidecar) {
    if (context.sidecar["@type"][0] !== `${schemaNamespace}Dataset`) {
      let issueFile2;
      if (Object.keys(context.metadataProvenance).includes("@type"))
        issueFile2 = context.metadataProvenance["@type"];
      else
        issueFile2 = context.dataset.metadataFile;
      context.issues.addSchemaIssue("IncorrectDatasetType", [
        {
          ...issueFile2,
          evidence: `dataset_description.json's "@type" property must have "Dataset" as its value.
                      additionally, the term "Dataset" must implicitly or explicitly use the schema.org namespace.
                      The schema.org namespace can be explicitly set using the "@context" key`
        }
      ]);
      return;
    }
  } else {
    context.issues.addSchemaIssue("MissingDatasetType", [
      {
        ...context.file,
        evidence: `dataset_description.json must have either the "@type" or the "type" property.`
      }
    ]);
    return;
  }
  issues = _schemaCheck(context.sidecar, context, schema, "", schemaNamespace, issues);
  logSchemaIssues(context, issues);
}
function logSchemaIssues(context, issues) {
  if (issues.termIssues.length != 0) {
    issues.termIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile2;
      if (Object.keys(context.metadataProvenance).includes(rootKey))
        issueFile2 = context.metadataProvenance[rootKey];
      else
        issueFile2 = context.dataset.metadataFile;
      context.issues.addSchemaIssue("InvalidSchemaorgProperty", [
        {
          ...issueFile2,
          evidence: `This file contains one or more keys that use the schema.org namespace, but are not  official schema.org properties.
                      According to the psych-DS specification, this is not an error, but be advised that these terms will not be
                      machine-interpretable and do not function as linked data elements. These are the keys in question: [${issues.termIssues}]`
        }
      ]);
    });
  }
  if (issues.typeIssues.length != 0) {
    issues.typeIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile2;
      if (rootKey in context.metadataProvenance)
        issueFile2 = context.metadataProvenance[rootKey];
      else
        issueFile2 = context.dataset.metadataFile;
      context.issues.addSchemaIssue("InvalidObjectType", [
        {
          ...issueFile2,
          evidence: `This file contains one or more objects with types that do not match the selectional constraints of their keys.
                        Each schema.org property (which take the form of keys in your metadata json) has a specific range of types
                        that can be used as its value. Type constraints for a given property can be found by visiting their corresponding schema.org
                        URL. All properties can take strings or URLS as objects, under the assumption that the string/URL represents a unique ID.
                        Type selection errors occured at the following locations in your json structure: [${issues.typeIssues}]`
        }
      ]);
    });
  }
  if (issues.typeMissingIssues.length != 0) {
    issues.typeMissingIssues.forEach((issue) => {
      const rootKey = issue.split(".")[1];
      let issueFile2;
      if (Object.keys(context.metadataProvenance).includes(rootKey))
        issueFile2 = context.metadataProvenance[rootKey];
      else
        issueFile2 = context.dataset.metadataFile;
      context.issues.addSchemaIssue("ObjectTypeMissing", [
        {
          ...issueFile2,
          evidence: `This file contains one or more objects without a @type property. Make sure that any object that you include
                      as the value of a schema.org property contains a valid schema.org @type, unless it is functioning as some kind of 
                      base type, such as Text or URL, containing a @value key. @type is optional, but not required on such objects.
                      The following objects without @type were found: [${issues.typeMissingIssues}]`
        }
      ]);
    });
  }
  if (issues.unknownNamespaceIssues.length != 0) {
    issues.unknownNamespaceIssues.forEach((issue) => {
      const rootKey = issue.split(".")[0];
      let issueFile2;
      if (Object.keys(context.metadataProvenance).includes(rootKey))
        issueFile2 = context.metadataProvenance[rootKey];
      else
        issueFile2 = context.dataset.metadataFile;
      context.issues.addSchemaIssue("UnknownNamespace", [
        {
          ...issueFile2,
          evidence: `This file contains one or more references to namespaces other than https://schema.org:
                      [${issues.unknownNamespaceIssues}].`
        }
      ]);
    });
  }
}
function _schemaCheck(node, context, schema, objectPath, nameSpace, issues) {
  let superClassSlots = [];
  let thisType = "";
  if ("@type" in node) {
    thisType = node["@type"][0];
    superClassSlots = getSuperClassSlots(thisType, schema, nameSpace);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@"))
      continue;
    else {
      if (!key.startsWith(nameSpace)) {
        issues.unknownNamespaceIssues.push(key);
        continue;
      } else {
        const property = key.replace(nameSpace, "");
        let range = [];
        if (property in schema[`schemaOrg.slots`]) {
          if ("range" in schema[`schemaOrg.slots.${property}`]) {
            range.push(schema[`schemaOrg.slots.${property}.range`]);
            range = range.concat(getSubClassSlots(schema[`schemaOrg.slots.${property}.range`], schema, nameSpace));
          }
          if ("any_of" in schema[`schemaOrg.slots.${property}`]) {
            for (const ran of schema[`schemaOrg.slots.${property}`].any_of) {
              if ("range" in ran) {
                range.push(ran.range);
                range = range.concat(getSubClassSlots(ran.range, schema, nameSpace));
              }
            }
          }
        }
        let subKeys = [];
        if (!superClassSlots.includes(property)) {
          issues.termIssues.push(`${objectPath}.${property}`);
        } else {
          for (let i = 0; i < value.length; i++) {
            const obj = value[i];
            subKeys = Object.keys(obj);
            if (!(subKeys.length === 1 && (subKeys.includes("@id") || subKeys.includes("@value")))) {
              if (subKeys.includes("@type")) {
                const objType = Array.isArray(obj["@type"]) ? obj["@type"][0].replace(nameSpace, "") : obj["@type"].replace(nameSpace, "");
                if (![...range, "Text", "URL"].includes(objType))
                  issues.typeIssues.push(`${objectPath}.${property}${i === 0 ? "" : `[${i}]`}`);
                issues = _schemaCheck(obj, context, schema, `${objectPath}.${property}`, nameSpace, issues);
              } else
                issues.typeMissingIssues.push(`${objectPath}.${property}${i === 0 ? "" : `[${i}]`}`);
            }
          }
        }
      }
    }
  }
  return issues;
}
function getSuperClassSlots(type, schema, nameSpace) {
  if (type.includes(nameSpace)) {
    type = type.replace(nameSpace, "");
  }
  if (type in schema[`schemaOrg.classes`]) {
    if ("is_a" in schema[`schemaOrg.classes.${type}`]) {
      if ("slots" in schema[`schemaOrg.classes.${type}`]) {
        return schema[`schemaOrg.classes.${type}.slots`].concat(getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`], schema, nameSpace));
      } else
        return getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`], schema, nameSpace);
    } else
      return schema[`schemaOrg.classes.${type}.slots`];
  }
  return [];
}
function getSubClassSlots(type, schema, nameSpace) {
  const subClasses = [];
  if (type.includes(nameSpace)) {
    type = type.replace(nameSpace, "");
  }
  if (type in schema[`schemaOrg.classes`]) {
    for (const [key, value] of Object.entries(schema["schemaOrg.classes"])) {
      if ("is_a" in value && value["is_a"] === type) {
        subClasses.push(key);
        subClasses.concat(getSubClassSlots(key, schema, nameSpace));
      }
    }
    return subClasses;
  } else
    return [];
}
function getFieldSeverity(requirement, context) {
  const levelToSeverity = {
    recommended: "ignore",
    required: "error",
    optional: "ignore",
    prohibited: "ignore"
  };
  let severity = "ignore";
  if (typeof requirement === "string" && requirement in levelToSeverity) {
    severity = levelToSeverity[requirement];
  } else if (typeof requirement === "object" && requirement.level) {
    severity = levelToSeverity[requirement.level];
    const addendumRegex = /(required|recommended) if \`(\w+)\` is \`(\w+)\`/;
    if (requirement.level_addendum) {
      const match = addendumRegex.exec(requirement.level_addendum);
      if (match && match.length === 4) {
        const [_, addendumLevel, key, value] = match;
        if (key in context.sidecar && context.sidecar[key] === value) {
          severity = levelToSeverity[addendumLevel];
        }
      }
    }
  }
  return severity;
}

// src/summary/summary.ts
var Summary = class {
  totalFiles;
  size;
  dataProcessed;
  dataTypes;
  schemaVersion;
  suggestedColumns;
  constructor() {
    this.dataProcessed = false;
    this.totalFiles = -1;
    this.size = 0;
    this.dataTypes = /* @__PURE__ */ new Set();
    this.schemaVersion = "";
    this.suggestedColumns = [];
  }
  async update(context) {
    if (context.file.path.startsWith("/derivatives") && !this.dataProcessed) {
      return;
    }
    this.totalFiles++;
    this.size += await context.file.size;
    if (context.datatype.length) {
      this.dataTypes.add(context.datatype);
    }
  }
  formatOutput() {
    return {
      totalFiles: this.totalFiles,
      size: this.size,
      dataProcessed: this.dataProcessed,
      dataTypes: Array.from(this.dataTypes),
      schemaVersion: this.schemaVersion,
      suggestedColumns: this.suggestedColumns
    };
  }
};

// src/utils/objectPathHandler.ts
var hasProp = (obj, prop) => {
  return Object.prototype.hasOwnProperty.call(obj, prop);
};
var objectPathHandler = {
  get(target, property) {
    let res = target;
    for (const prop of property.split(".")) {
      if (hasProp(res, prop)) {
        res = res[prop];
      } else {
        return void 0;
      }
    }
    return res;
  }
};

// default_schema/schema.json
var schema_default = {
  meta: {
    context: {
      context: {
        type: "object",
        description: "The context defines the vocabulary of properties that objects and rules within the schema can use.",
        properties: {
          schema: {
            description: "The psych-DS schema",
            type: "object"
          },
          dataset: {
            description: "Properties and contents of the entire dataset",
            type: "object",
            properties: {
              dataset_description: {
                description: "Contents of /dataset_description.json",
                type: "object"
              },
              files: {
                description: "List of all files in dataset",
                type: "array"
              },
              tree: {
                description: "Tree view of all files in dataset",
                type: "object"
              },
              ignored: {
                description: "Set of ignored files",
                type: "array"
              }
            }
          },
          path: {
            description: "Full path of the current file",
            type: "string"
          },
          suffix: {
            description: "String following the final '_' in a filename and preceding the '.' of the extension. Used to identify datafiles primarily.",
            type: "string"
          },
          extensions: {
            description: "Extension of current file including initial dot",
            type: "string"
          },
          stem: {
            type: "string",
            description: "Portion of the filename which excludes the extension."
          },
          level: {
            type: "string",
            description: "Property describing the severity of a rule, which determines whether it produces an error, warning, etc."
          },
          code: {
            type: "string",
            description: "Unique code identifying a specific error/warning"
          },
          reason: {
            type: "string",
            description: "Paragraph accompanying an error/warning that provides context for what may cause it."
          },
          directory: {
            type: "boolean",
            description: "Indicator for whether a given object is expected to be a directory or a file."
          },
          arbitraryNesting: {
            type: "boolean",
            description: "Indicator for whether a given file object is allowed to be nested within an arbitrary number of subdirectories."
          },
          usesKeywords: {
            type: "boolean",
            description: "Indicator for whether a given file object requires keyword formatting."
          },
          nonCanonicalKeywordsAllowed: {
            type: "boolean",
            description: "Indicator for whether a given file object is required to use only official Psych-DS keywords"
          },
          fileRegex: {
            type: "regular expression",
            description: "Regular expression defining the legal formatting of a filename."
          },
          baseDir: {
            type: "string",
            description: "Name of the directory under which the file object is expected to appear."
          },
          fields: {
            type: "object",
            description: "Set of key/value pairs defining the fields that are expected to occur in a given file object, and whether they are required or recommended."
          },
          namespace: {
            type: "string",
            description: "URL identifying the required namespace to be used for required fields in the file object. Namespaces are web prefixes that point to ontologies which contain definitions of semantic vocabularies."
          },
          jsonld: {
            type: "boolean",
            description: "Indicator for whether the given file object is required to be a valid JSON-LD object."
          },
          containsAllColumns: {
            type: "boolean",
            description: "The metadata object, after all inherited sidecars are accounted for, must contain a 'variableMeasured' property listing at least all of the column headers found in the datafile at hand."
          },
          columnsMatchMetadata: {
            type: "boolean",
            description: "Each datafile must only use column headers that appear in the 'variableMeasured' property of the compiled metadata object that corresponds to it."
          },
          sidecar: {
            description: "Sidecar metadata constructed via the inheritance principle",
            type: "object"
          },
          columns: {
            description: "CSV columns, indexed by column header, values are arrays with column contents",
            type: "object",
            additionalProperties: {
              type: "array"
            }
          },
          json: {
            description: "Contents of the current JSON file",
            type: "object"
          },
          requires: {
            type: "array",
            description: "Set of schema locations defining the objects that must be present for certain issues to be reported"
          },
          keywords: {
            description: "List of key-value pairings associated with the data file, derived from the filename",
            type: "array",
            properties: {
              study: {
                name: "Study",
                description: "Label designating a given study",
                type: "string"
              },
              site: {
                name: "Site",
                description: "Label designating the site where the data was collected",
                type: "string"
              },
              subject: {
                name: "Subject",
                description: "Label designating the subject corresponding to the data in the file",
                type: "string"
              },
              session: {
                name: "Session",
                description: "Label designating a given session of the study",
                type: "string"
              },
              task: {
                name: "Task",
                description: "Label designating the type of task in which the data was collected",
                type: "string"
              },
              condition: {
                name: "Condition",
                description: "Label designating the condition under which the data was collected",
                type: "string"
              },
              trial: {
                name: "Trial",
                description: "Label designating the trial associated with the data",
                type: "string"
              },
              stimulus: {
                name: "Stimulus",
                description: "Label designating the stimulus item associated with the data",
                type: "string"
              },
              description: {
                name: "Description",
                description: "Label describing the data file in question",
                type: "string"
              }
            }
          }
        }
      }
    }
  },
  objects: {
    common_principles: {
      dataset: {
        name: "Dataset",
        display_name: "Dataset",
        description: "A set of behavioral data acquired for the purpose of a particular study or set of studies.\n"
      },
      extension: {
        name: "File extension",
        display_name: "File extension",
        description: "A portion of the file name after the left-most period (`.`) preceded by any other alphanumeric.\nFor example, `.gitignore` does not have a file extension,\nbut the file extension of 'study-1_data.csv' is '.csv'.\nNote that the left-most period is included in the file extension.\n"
      },
      keywords: {
        name: "Keywords",
        display_name: "Keywords",
        description: "A set of identifying key-value duples associated with a given data file.\nKeys are limited to a vocabulary of:\n  - study\n  - site\n  - subject\n  - session\n  - task\n  - condition\n  - trial\n  - stimulus\n  - description\n"
      },
      raw_data: {
        name: "Raw data",
        display_name: "Raw data",
        description: "A central principle for Psych-DS is that the earliest form of the data you have access to should always be saved, \nshould never be modified, and should be kept separate from any additional versions created. This data could take any form,\nsuch as physical paper and pencil surveys, digital resources such as videos, etc. At a minimum, it is assumed that a psych-DS\ncompliant dataset will contain this original data under the /data directory.\n"
      },
      primary_data: {
        name: "Primary data",
        display_name: "Primary data",
        description: "Primary data is considered the first digitized form of the raw data. Sometimes, the primary data and the raw data are the same,\nin the case, for instance, of tabular online survey responses. If the raw data exists in a physical format, then some digitized \nversion must be included in the dataset.\n"
      },
      columns: {
        name: "Columns",
        display_name: "Columns",
        description: 'In general, Psych-DS has minimal restraints and conventions regarding column names. \nWe RECOMMEND that you use the controlled keywords defined elsewhere in the standard plus "_id"\nas column names if referring to the relevant information in a dataset. (That is, if you record trials\nwith the scope of a given datafile, we RECOMMEND that the name of the column identifying the trial\nbe "trial_id"). This information can be redundantly stored (i.e., a file named "study-MyExp_trial-1_data.csv"\ncan also have a column "trial_id" which has rows with the value "1").\n\nIn many cases, some combination of columns will uniquely identify every row in the dataset (for instance,\neach participant might have several rows, but there might be exactly one row for every combination of \nparticupant, condition, and trial.) The column or set of columns provides a unique key for every record/row in\nyour dataset. We RECOMMEND that you include a description of which columns create a unique key for your dataset\nin the README for your project.\n\nIf you have a column that uniquely identifies each single row of a dataset explicitly it SHOULD be named\n"row_id". A column named "row_id" MUST contain unique values in every row.\n'
      },
      inheritance: {
        name: "Inheritance",
        display_name: "Inheritance",
        description: `In addition to the mandatory "dataset_description.json" file at the root of the dataset,
Psych-DS allows for the inclusion of additional metadata files, whose fields apply to 
specific subsets of the data. There are two types of inherited metadata:

1. Sidecar files, which contain metadata that pertains to one specific datafile. These sidecars
must have the exact same name as their corresponding datafile, with the ".json" extension instead 
of the ".csv" extension. Sidecars must occupy the same directory as their datafile.
2. Directory metadata, which always takes the form "file_metadata.json". The metadata contained in
such files apply to all datafiles within its directory and all subdirectories thereof.

Metadata key/value pairs found in higher-level JSON files are inherited by all lower levels unless they are explicitly 
overridden by a file at the lower level.

For example, suppose we have the following project structure:

data/
  file_metadata.json
  subject-1/
    file_metadata.json
    subject-1_condition-A_data.csv
    subject-1_condition-B_data.json
    subject-1_condition-B_data.csv
  subject-2/
    subject-2_condition-A_data.json
    subject-2_condition-A_data.csv
    subject-2_condition-B_data.csv

There are 4 datafiles within the data/ hierarchy; let's consider which metadata files apply to each one, and in what order 
the metadata files should be processed/inherited:
 - data/subject-1/subject-1_condition-A_data.csv: There is no JSON sidecar for this file. 
   However, there is a file_metadata.json file in the same directory as the data file, 
   as well as in one above it. The consolidated metadata object would start with the 
   contents of the higher-level file (data/file_metadata.json), and then update it with 
   the contents of the lower-level file (data/subject-1/file_metadata.json).
 - data/subject-1/subject-1_condition-B_data.csv: The same process unfolds as for the previous 
   file; however, the consolidated object is now further updated with the contents of the target 
   data file\u2019s JSON sidecar (i.e., subject-1_condition-B_data.json).
 - data/subject-2/subject-2_condition-A_data.csv: The contents of data/file_metadata.json 
   are read, and then updated with the contents of data/subject-2/subject-2_condition-A_data.json.
 - data/subject-2/subject-2_condition-B_data.csv: There is only a single applicable metadata 
   file (data/file_metadata.json), from which all metadata is read.

Note that any inherited key/value pair from a metadata file replaces the value for the key wholesale,
and there is no merging processed involved. For instance, if the root metadata file contains a "variableMeasured"
property with 10 elements, and a lower level metadata file contains a "variableMeasured" property with
5 elements, the resulting inherited object will only contain the 5 "variableMeasured" elements
from the inherited metadata. The lists are not combined in any way, but replaced.`
      }
    },
    metadata: {
      name: {
        name: "name",
        display_name: "Name",
        description: "Name of the dataset.\n",
        type: "string"
      },
      schemaVersion: {
        name: "schemaVersion",
        display_name: "Schema Version",
        description: "The version of the data specification that this dataset conforms to.\n",
        type: "string"
      },
      description: {
        name: "description",
        display_name: "Description",
        description: "Detailed description of the dataset.\n",
        type: "string"
      },
      variableMeasured: {
        name: "variableMeasured",
        display_name: "Variable Measured",
        description: "List of the column names that appear in the data files.\n",
        type: "array"
      },
      author: {
        name: "author",
        display_name: "Author",
        description: "List of individuals who contributed to the creation/curation of the dataset.\n",
        type: "array",
        items: {
          type: "string"
        }
      },
      citation: {
        name: "citation",
        display_name: "Citation",
        description: "Citation data for referencing the dataset, or URL/path for structured citation file.\n",
        type: "string"
      },
      license: {
        name: "license",
        display_name: "Kucebse",
        description: "Author-assigned 'license' for data/material use. While this can be a string of text, \na URL pointing to a specific license file (online or in the project directory) is preferred.\n",
        type: "string"
      },
      funder: {
        name: "funder",
        display_name: "Funder",
        description: "List of sources of funding (grant numbers).\n",
        type: "string"
      },
      url: {
        name: "url",
        display_name: "URL",
        description: "Canonical source for the dataset.\n",
        type: "string"
      },
      identifier: {
        name: "identifier",
        display_name: "Identifier",
        description: "Identifier that uniquely distinguishes the dataset.\n",
        type: "string"
      },
      usageInfo: {
        name: "usageInfo",
        display_name: "Privacy Policy",
        description: "A string to indicate whether any of the values in the dataset are desired to be shareable.\nThis does not guarantee that the dataset HAS been shared or HAS been de identified,.\n",
        type: "string"
      },
      keywords: {
        name: "keywords",
        display_name: "Keywords",
        description: "Keywords with which to tag the dataset for reference.\n",
        type: "array"
      }
    },
    extensions: {
      json: {
        value: ".json",
        display_name: "JavaScript Object Notation",
        description: "A JSON file.\n\nTop-level and collated metadata files are all stored in the JSON format in psych-DS.\n"
      },
      csv: {
        value: ".csv",
        display_name: "Comma-Separated Values",
        description: "A CSV file with a header row of column names spanning all filled columns. In Psych-DS,\nCSV files have the following rules related to their formatting:\n- Each CSV file MUST start with a header line listing the names of all columns. Names MUST be separated with commas.\n- String values containing commas MUST be escaped using double quotes\n- UTF-8 encoding MUST be used\n- using . rather than , for decimals is RECOMMENDED"
      }
    },
    files: {
      CHANGES: {
        display_name: "Changelog",
        file_type: "regular",
        description: "Version history of the dataset \\(describing changes, updates and corrections\\) MAY be provided in the form of a 'CHANGES' text file. \\(.txt or .md\\)."
      },
      README: {
        display_name: "README",
        file_type: "regular",
        description: "Human-readable file describing the project and dataset in detail. This is an OPTIONAL file, and only one README file should appear in dataset."
      },
      dataset_description: {
        display_name: "Dataset Description",
        file_type: "regular",
        description: "The metadata file 'dataset_description.json' is a JSON file describing the dataset."
      },
      Datafile: {
        display_name: "CSV Datafile",
        file_type: "regular",
        description: "A CSV file under the /data directory in which the official psych-DS compliant data from the dataset is stored. Datafiles must follow Psych-DS file naming conventions, which includes the use of keyword formatting, the '_data' suffix, and the '.csv' extension. An example of a valid datafile might be 'study-123_site-lab4_data.csv'. In the future, more official suffices and extensions may be made available. A controlled list of official keywords is provided, but the use of unofficial keywords is permitted, so long as they are clearly defined and used consistently within a research community."
      },
      data: {
        display_name: "Data",
        file_type: "directory",
        description: "The directory in which to store all datafiles from the dataset."
      },
      primary_data: {
        display_name: "Primary data",
        file_type: "directory",
        description: "A subfolder holding the primary data, which may be either Psych-DS compliant CSV or some other file type"
      },
      analysis: {
        display_name: "Analysis",
        file_type: "directory",
        description: "A directory to store code or other tools used to analyze the data/ files in order to describe and interpret the dataset. Any intermediate data files created during analysis SHOULD be output to a new file in data/ \\(i.e. primary_data/ files SHOULD NOT be modified.\\)"
      },
      results: {
        display_name: "Results",
        file_type: "directory",
        description: "A directory in which to store any results generated using the data in /data."
      },
      materials: {
        display_name: "Materials",
        file_type: "directory",
        description: "A directory in which to store any materials used to conduct the study."
      },
      documentation: {
        display_name: "Documentation",
        file_type: "directory",
        description: "A directory in which to store any project-related documentation that is used for conducting the study \\(e.g. consent forms\\)"
      },
      products: {
        display_name: "Products",
        file_type: "directory",
        description: "A directory in which to store any Any relevant products resulting from the project \\(e.g., publications, posters, software descriptions, presentations, etc.\\)"
      },
      DirectoryMetadata: {
        display_name: "Directory Metadata",
        file_type: "regular",
        description: "A json file in which to store metadata that applies to all datafiles within the containing directory or within any nested subdirectories. Fields from the file replace the values of the global dataset_description object."
      },
      SidecarMetadata: {
        display_name: "Sidecar Metadata",
        file_type: "regular",
        description: "A json file in which to store metadata that applies to a specific datafile within the containing directory. Fields from the file replace the values of the global dataset_description object, and overwrite any fields shared with the directory metadata."
      },
      CompiledMetadata: {
        display_name: "Compiled Metadata",
        file_type: "composite",
        description: "The metadata object that results from the combination of global metadata and directory- and file-level metadata files according to the rules of inheritance."
      }
    }
  },
  rules: {
    files: {
      tabular_data: {
        data: {
          Datafile: {
            requires: "data",
            suffix: "data",
            extensions: [
              ".csv"
            ],
            baseDir: "data",
            arbitraryNesting: true,
            columnsMatchMetadata: true,
            usesKeywords: true,
            nonCanonicalKeywordsAllowed: true,
            fileRegex: "([a-z]+-[a-zA-Z0-9]+)(_[a-z]+-[a-zA-Z0-9]+)*_data\\.csv",
            code: "MISSING_DATAFILE",
            level: "error",
            reason: "It is required to include at least one valid csv datafile under the data subdirectory "
          }
        }
      },
      common: {
        core: {
          dataset_description: {
            level: "error",
            baseDir: "/",
            stem: "dataset_description",
            arbitraryNesting: false,
            extensions: [
              ".json"
            ],
            code: "MISSING_DATASET_DESCRIPTION",
            reason: "It is required to include a 'dataset_description.json' in the base directory",
            helpUrl: "https://psychds-docs.readthedocs.io/en/latest/Schema%20Reference/objects/files/dataset_description/"
          },
          README: {
            level: "warning",
            baseDir: "/",
            stem: "README",
            arbitraryNesting: false,
            extensions: [
              ".md",
              ".txt"
            ],
            code: "MISSING_README_DOC",
            reason: "It is recommended to include a 'README.md' or 'README.txt' file in the base directory"
          },
          CHANGES: {
            level: "warning",
            baseDir: "/",
            stem: "CHANGES",
            arbitraryNesting: false,
            extensions: [
              ".md",
              ".txt"
            ],
            code: "MISSING_CHANGES_DOC",
            reason: "It is recommended to include a 'CHANGES.md' or 'CHANGES.txt' file in the base directory"
          },
          data: {
            level: "error",
            path: "/data",
            directory: true,
            requires: "dataset_description",
            code: "MISSING_DATA_DIRECTORY",
            reason: "It is required to include a subdirectory named 'data' in the base directory"
          },
          analysis: {
            level: "warning",
            path: "/analysis",
            directory: true,
            code: "MISSING_ANALYSIS_DIRECTORY",
            reason: "It is recommended to include subdirectory named 'analysis' in the base directory"
          },
          results: {
            level: "warning",
            path: "/results",
            directory: true,
            code: "MISSING_RESULTS_DIRECTORY",
            reason: "It is recommended to include subdirectory named 'results' in the base directory"
          },
          materials: {
            level: "warning",
            path: "/materials",
            directory: true,
            code: "MISSING_MATERIALS_DIRECTORY",
            reason: "It is recommended to include subdirectory named 'materials' in the base directory"
          },
          documentation: {
            level: "warning",
            path: "/documentation",
            directory: true,
            code: "MISSING_DOCUMENTATION_DIRECTORY",
            reason: "It is recommended to include subdirectory named 'documentation' in the base directory"
          },
          psychdsignore: {
            level: "warning",
            path: "/.psychdsignore",
            code: "MISSING_PSYCHDSIGNORE",
            reason: "It is recommended to include a file called '.psychdsignore' in the base directory to indicate files/directories that the validator process should ignore."
          }
        }
      },
      metadata: {
        DirectoryMetadata: {
          stem: "file_metadata",
          extensions: [
            ".json"
          ],
          baseDir: "data",
          arbitraryNesting: true,
          level: "warning",
          code: "MISSING_DIRECTORY_METADATA",
          reason: "It is optional to include a json metadata file within a data subdirectory that \napplies to all files within the current directory and its subdirectories\n"
        },
        SidecarMetadata: {
          baseDir: "data",
          arbitraryNesting: true,
          suffix: "data",
          level: "warning",
          extensions: [
            ".json"
          ],
          code: "MISSING_SIDECAR_METADATA",
          reason: "It is optional to include a json metadata file within a data subdirectory\nthat applies to a specific csv datafile within the current directory"
        }
      }
    },
    errors: {
      JsonInvalid: {
        code: "JSON_INVALID",
        reason: "Not a valid JSON file.\n",
        level: "error",
        selectors: [
          'extension == ".json"'
        ],
        requires: []
      },
      FileRead: {
        code: "FILE_READ",
        reason: "We were unable to read this file.\nMake sure it contains data (file size > 0 kB) and is not corrupted,\nincorrectly named, or incorrectly symlinked.\n",
        level: "error",
        requires: []
      },
      EmptyFile: {
        code: "EMPTY_FILE",
        level: "error",
        reason: "empty files not allowed.",
        requires: []
      },
      InvalidJsonEncoding: {
        code: "INVALID_JSON_ENCODING",
        reason: "JSON files must be valid utf-8.\n",
        level: "error",
        selectors: [
          'extension == ".json"'
        ],
        requires: [
          "rules.files.common.core.dataset_description"
        ]
      },
      JsonKeyRequired: {
        code: "JSON_KEY_REQUIRED",
        level: "error",
        reason: "The metadata object is missing a key listed as required.",
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      JsonKeyRecommended: {
        code: "JSON_KEY_RECOMMENDED",
        level: "warning,",
        reason: "The metadata object is missing a key listed as recommended.",
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      CsvColumnMissing: {
        code: "CSV_COLUMN_MISSING",
        level: "error",
        reason: "A required column is missing",
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      NotIncluded: {
        code: "NOT_INCLUDED",
        level: "warning",
        reason: 'Files with such naming scheme are not part of psych-DS specification.\nUnder the rules of psych-DS, non-specified files are allowed to be included,\nbut if you would like to avoid receiving this warning moving forward, you can include\nin your ".psychdsignore" file\n',
        requires: []
      },
      MissingRequiredElement: {
        code: "MISSING_REQUIRED_ELEMENT",
        level: "error",
        reason: "Your dataset is missing an element that is required under the psych-DS specification.",
        requires: []
      },
      NoHeader: {
        code: "NO_HEADER",
        level: "error",
        reason: "CSV data files must contain a valid header with at least one column.",
        requires: [
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      CSVFormattingError: {
        code: "CSV_FORMATTING_ERROR",
        level: "error",
        reason: "CSV data files must be parsable as valid CSV formatting.",
        requires: [
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      HeaderRowMismatch: {
        code: "HEADER_ROW_MISMATCH",
        level: "error",
        reason: "The header and all rows for CSV data files must contain the same number of columns.",
        requires: [
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      RowidValuesNotUnique: {
        code: "ROWID_VALUES_NOT_UNIQUE",
        level: "error",
        reason: 'Columns within CSV data files with the header "row_id" must contain unique values in every row.',
        requires: [
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      WrongMetadataLocation: {
        code: "WRONG_METADATA_LOCATION",
        level: "warning",
        reason: "The main metadata file must be located within the root directory",
        requires: []
      },
      KeywordFormattingError: {
        code: "KEYWORD_FORMATTING_ERROR",
        level: "error",
        reason: "All datafiles must use psych-DS keyword formatting. That is, datafile names must consist of\na series of keyword-value pairs, separated by underscores, with keywords using only lowercase\nalphabetic characters and values using any alphanumeric characters of either case. The file must\nend with '_data.csv'. In other words, files must follow this regex: \n/([a-z]+-[a-zA-Z0-9]+)(_[a-z]+-[a-zA-Z0-9]+)*_data\\.csv/\n",
        requires: []
      },
      UnofficialKeywordWarning: {
        code: "UNOFFICIAL_KEYWORD_WARNING",
        level: "warning",
        reason: "Although it is not recommended, datafiles are permitted to use keywords other than those provided\nin the official psych-DS specification. If you do choose to use unofficial keywords, please ensure\nthat they are clearly defined within your research community and used consistently across relevant datasets.\n",
        requires: []
      },
      UnofficialKeywordError: {
        code: "UNOFFICIAL_KEYWORD_ERROR",
        level: "error",
        reason: "Names for data files must not include keywords other than those listed in the psych-DS schema.",
        requires: []
      },
      InvalidJsonFormatting: {
        code: "INVALID_JSON_FORMATTING",
        level: "error",
        reason: "One of your metadata files in not in valid JSON format.",
        requires: [
          "rules.files.common.core.dataset_description"
        ]
      },
      InvalidJsonldFormatting: {
        code: "INVALID_JSONLD_FORMATTING",
        level: "error",
        reason: "Your metadata files are required to follow legal JSON-LD formatting.",
        requires: [
          "rules.files.common.core.dataset_description"
        ]
      },
      IncorrectDatasetType: {
        code: "INCORRECT_DATASET_TYPE",
        level: "error",
        reason: 'Your metadata is missing the required schema.org "Dataset" type',
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      MissingDatasetType: {
        code: "MISSING_DATASET_TYPE",
        level: "error",
        reason: 'Your metadata is missing the "@type/type" property, which is required.',
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      UnknownNamespace: {
        code: "UNKNOWN_NAMESPACE",
        level: "warning",
        reason: 'The psych-DS validator only has access to one external vocabulary, "http://schema.org";\nany other reference to an external schema is permitted, but the validity of the terms used\ncannot be confirmed.\n',
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      ObjectTypeMissing: {
        code: "OBJECT_TYPE_MISSING",
        level: "warning",
        reason: 'For compliance with the schema.org ontology, all objects within the metadata (with a few exceptions)\nthat appear as the value of a schema.org key/property must contain a "@type" key with a valid schema.org type \nas its value.\n',
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      InvalidSchemaorgProperty: {
        code: "INVALID_SCHEMAORG_PROPERTY",
        level: "warning",
        reason: "The schema.org ontology contains a fixed set of legal properties which can be applied to objects within the metadata.\n If schema.org is used as the only @context within your metadata, then all properties will be interpreted as schema.org properties.\n Using an invalid schema.org property is not considered an error in the psych-DS specification, but it should be understood\n that such usages result in the property in question not being interpretable by machines.\n",
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      InvalidObjectType: {
        code: "INVALID_OBJECT_TYPE",
        level: "warning",
        reason: "Properties in the schema.org ontology have selective restrictions on which types of objects can be used for their values.\nincluding an object with a @type that does not match the selective restrictions of its property is not an error in psych-DS,\nbut it will result in the object in question not being interpretable by machines.\n",
        requires: [
          "rules.files.common.core.dataset_description",
          "rules.files.tabular_data.data.Datafile"
        ]
      },
      ExtensionMismatch: {
        code: "EXTENSION_MISMATCH",
        level: "error",
        reason: "Extension used by file does not match allowed extensions for its suffix.\n",
        requires: []
      }
    },
    common_principles: [
      "dataset",
      "extension",
      "keywords"
    ],
    csv_data: {
      Datafile: {
        selectors: [
          'extension == ".csv"',
          'suffix == "data"',
          'baseDir == "data"'
        ],
        columnsMatchMetadata: true
      }
    },
    compiled_metadata: {
      CompiledMetadata: {
        selectors: [
          'suffix == "data"',
          'extension == ".csv"',
          'baseDir == "data"'
        ],
        fields: {
          name: "required",
          description: "required",
          variableMeasured: "required",
          author: "recommended",
          citation: "recommended",
          license: "recommended",
          funder: "recommended",
          url: "recommended",
          identifier: "recommended",
          privacyPolicy: "recommended",
          keywords: "recommended"
        },
        namespace: "http://schema.org/",
        jsonld: true,
        containsAllColumns: true
      }
    }
  }
};

// src/setup/loadSchema.ts
async function loadSchema(version = "latest") {
  const versionRegex = /\d+.\d+.\d+/;
  let schemaUrl = version;
  const psychdsSchema = typeof Deno !== "undefined" ? Deno.env.get("psychDS_SCHEMA") : void 0;
  const schemaOrgUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/external_schemas/schemaorg/schemaorg.json?v=${Date.now()}`;
  if (psychdsSchema !== void 0) {
    schemaUrl = psychdsSchema;
  } else if (version === "latest" || versionRegex.test(version)) {
    schemaUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/versions/jsons/${version}/schema.json?v=${Date.now()}`;
  }
  try {
    let schemaModule = await fetch(schemaUrl).then((response) => response.text()).then((data) => JSON.parse(data)).catch((error2) => {
      console.error("Error fetching JSON:", error2);
    });
    schemaModule = { ...schemaModule };
    const schemaOrgModule = await fetch(schemaOrgUrl).then((response) => response.text()).then((data) => JSON.parse(data)).catch((error2) => {
      console.error("Error fetching JSON:", error2);
    });
    schemaModule = {
      ...schemaModule,
      schemaOrg: schemaOrgModule
    };
    return new Proxy(
      schemaModule,
      objectPathHandler
    );
  } catch (error2) {
    console.error(error2);
    console.error(
      `Warning, could not load schema from ${schemaUrl}, falling back to internal version`
    );
    return new Proxy(
      schema_default,
      objectPathHandler
    );
  }
}

// src/types/columns.ts
var ColumnsMap = class extends Map {
  constructor() {
    super();
    const columns = /* @__PURE__ */ new Map();
    return columns;
  }
};

// src/schema/elements.ts
function _readElements(filename) {
  let extension = "";
  let suffix = "";
  const keywords = {};
  const parts = filename.split("_");
  for (let i = 0; i < parts.length - 1; i++) {
    const [key, value] = parts[i].split("-");
    keywords[key] = value || "NOKEYWORD";
  }
  const lastPart = parts[parts.length - 1];
  const extStart = lastPart.indexOf(".");
  if (extStart === -1) {
    suffix = lastPart;
  } else {
    suffix = lastPart.slice(0, extStart);
    extension = lastPart.slice(extStart);
  }
  return { keywords, suffix, extension };
}
var readElements = memoize(_readElements);

// src/files/csv.ts
import { parse as parse2 } from "https://deno.land/std@0.190.0/csv/mod.ts";
var normalizeEOL = (str) => str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
function parseCSV(contents) {
  const columns = new ColumnsMap();
  const issues = [];
  const normalizedStr = normalizeEOL(contents);
  try {
    const rows = parse2(normalizedStr);
    const headers = rows.length ? rows[0] : [];
    if (headers.length === 0)
      issues.push({ "issue": "NoHeader", "message": null });
    else {
      if (!rows.slice(1).every((row) => row.length === headers.length))
        issues.push({ "issue": "HeaderRowMismatch", "message": null });
    }
    headers.map((x) => {
      columns[x] = [];
    });
    for (let i = 1; i < rows.length; i++) {
      for (let j = 0; j < headers.length; j++) {
        const col = columns[headers[j]];
        col.push(rows[i][j]);
      }
    }
    if (Object.keys(columns).includes("row_id") && [...new Set(columns["row_id"])].length !== columns["row_id"].length)
      issues.push({ "issue": "RowidValuesNotUnique", "message": null });
  } catch (error2) {
    issues.push({ "issue": "CSVFormattingError", "message": error2.message });
  }
  const response = {
    "columns": columns,
    "issues": issues
  };
  return response;
}

// src/schema/context.ts
var psychDSContextDataset = class {
  dataset_description;
  metadataFile;
  options;
  // deno-lint-ignore no-explicit-any
  files;
  baseDirs;
  tree;
  // deno-lint-ignore no-explicit-any
  ignored;
  constructor(options, metadataFile, description = {}) {
    this.dataset_description = description;
    this.files = [];
    this.metadataFile = metadataFile;
    this.baseDirs = [];
    this.tree = {};
    this.ignored = [];
    if (options) {
      this.options = options;
    }
  }
};
var defaultDsContext = new psychDSContextDataset();
var psychDSContext = class {
  // Internal representation of the file tree
  fileTree;
  filenameRules;
  issues;
  file;
  fileName;
  extension;
  suffix;
  baseDir;
  keywords;
  dataset;
  datatype;
  sidecar;
  expandedSidecar;
  columns;
  metadataProvenance;
  suggestedColumns;
  validColumns;
  constructor(fileTree, file, issues, dsContext) {
    this.fileTree = fileTree;
    this.filenameRules = [];
    this.issues = issues;
    this.file = file;
    this.fileName = file.name.split(".")[0];
    this.baseDir = file.path.split("/").length > 2 ? file.path.split("/")[1] : "/";
    const elements = readElements(file.name);
    this.keywords = elements.keywords;
    this.extension = elements.extension;
    this.suffix = elements.suffix;
    this.dataset = dsContext ? dsContext : defaultDsContext;
    this.datatype = "";
    this.sidecar = dsContext ? dsContext.dataset_description : {};
    this.expandedSidecar = {};
    this.validColumns = [];
    this.metadataProvenance = {};
    this.columns = new ColumnsMap();
    this.suggestedColumns = [];
  }
  // deno-lint-ignore no-explicit-any
  get json() {
    return JSON.parse(this.file.fileText);
  }
  get path() {
    return this.file.path;
  }
  /**
   * Implementation specific absolute path for the dataset root
   *
   * In the browser, this is always at the root
   */
  get datasetPath() {
    return this.fileTree.path;
  }
  /**
   * Crawls fileTree from root to current context file, loading any valid
   * json sidecars found.
   */
  async loadSidecar(fileTree) {
    if (!fileTree) {
      fileTree = this.fileTree;
    }
    const validSidecars = fileTree.files.filter((file) => {
      const { suffix, extension } = readElements(file.name);
      return (
        // TODO: Possibly better to just specify that files matching any rule from the metadata.yaml file are sidecars
        extension === ".json" && suffix === "data" && file.name.split(".")[0] === this.fileName || extension === ".json" && file.name.split(".")[0] == "file_metadata"
      );
    });
    if (validSidecars.length > 1) {
      const exactMatch = validSidecars.find(
        (sidecar) => sidecar.path == this.file.path.replace(this.extension, ".json")
      );
      if (exactMatch) {
        validSidecars.splice(1);
        validSidecars[0] = exactMatch;
      } else {
        logger.warning(
          `Multiple sidecar files detected for '${this.file.path}'`
        );
      }
    }
    if (validSidecars.length === 1) {
      this.sidecar = { ...this.sidecar, ...validSidecars[0].expanded };
      Object.keys(validSidecars[0].expanded).forEach((key) => {
        const baseKey = key.split("/").at(-1);
        this.metadataProvenance[baseKey] = validSidecars[0];
      });
    }
    const nextDir = fileTree.directories.find((directory) => {
      return this.file.path.startsWith(directory.path);
    });
    if (nextDir) {
      await this.loadSidecar(nextDir);
    } else {
      this.expandedSidecar = {};
      this.loadValidColumns();
    }
  }
  // get validColumns from metadata sidecar
  // used to determined which columns can/must appear within csv headers
  loadValidColumns() {
    if (this.extension !== ".csv") {
      return;
    }
    const nameSpace = "http://schema.org/";
    if (!(`${nameSpace}variableMeasured` in this.sidecar)) {
      return;
    }
    let validColumns = [];
    for (const variable of this.sidecar[`${nameSpace}variableMeasured`]) {
      if ("@value" in variable)
        validColumns = [...validColumns, variable["@value"]];
      else {
        if (`${nameSpace}name` in variable) {
          const subVar = variable[`${nameSpace}name`][0];
          if ("@value" in subVar)
            validColumns = [...validColumns, subVar["@value"]];
        }
      }
    }
    this.validColumns = validColumns;
  }
  // get columns from csv file
  async loadColumns() {
    if (this.extension !== ".csv") {
      return;
    }
    let result;
    try {
      result = await parseCSV(this.file.fileText);
    } catch (error2) {
      logger.warning(
        `csv file could not be opened by loadColumns '${this.file.path}'`
      );
      logger.debug(error2);
      result = /* @__PURE__ */ new Map();
    }
    this.columns = result["columns"];
    this.reportCSVIssues(result["issues"]);
    return;
  }
  //multiple CSV issues are possible, so these are unpacked from the issue object
  reportCSVIssues(issues) {
    issues.forEach((issue) => {
      if (issue.message) {
        this.issues.addSchemaIssue(
          issue.issue,
          [{
            ...this.file,
            evidence: issue.message
          }]
        );
      } else {
        this.issues.addSchemaIssue(
          issue.issue,
          [this.file]
        );
      }
    });
  }
  /*
      async getExpandedSidecar(){
        try{
          //account for possibility of both http and https in metadata context
          if('@context' in this.sidecar){
            if(typeof(this.sidecar['@context']) === 'string'){
              if(['http://schema.org','https://schema.org','http://www.schema.org','https://www.schema.org','http://schema.org/','https://schema.org/','http://www.schema.org/','https://www.schema.org/'].includes(this.sidecar['@context'])){
                this.sidecar['@context'] = {
                  "@vocab":"https://schema.org/"
                }
              }
  
            }
          }
          //use the jsonld library to expand metadata json and remove context.
          //in addition to adding the appropriate namespace (e.g. http://schema.org)
          //to all keys within the json, it also throws a variety of errors for improper JSON-LD syntax,
          //which mostly all pertain to improper usages of privileged @____ keywords
          const exp = [] as string[]//await jsonld.expand(this.sidecar)
          if(!exp[0])
            return {}
          else
            return exp[0]
        }
        catch(error){
          //format thrown error and pipe into validator issues
          const issueFile = {
            ...this.file,
            evidence:JSON.stringify(error.details.context)
          } as IssueFile
          this.issues.add({
            key:'INVALID_JSONLD_SYNTAX',
            reason:`${error.message.split(';')[1]}`,
            severity:'error',
            files:[issueFile]
          })
          return {}
        }
      }*/
  async asyncLoads() {
    await Promise.allSettled([
      this.loadSidecar(),
      this.loadColumns()
    ]);
  }
};

// src/schema/walk.ts
async function* _walkFileTree(fileTree, root, issues, dsContext) {
  for (const file of fileTree.files) {
    yield new psychDSContext(root, file, issues, dsContext);
  }
  for (const dir of fileTree.directories) {
    if (fileTree.path === "/" && dsContext) {
      dsContext.baseDirs = [...dsContext.baseDirs, `/${dir.name}`];
    }
    yield* _walkFileTree(dir, root, issues, dsContext);
  }
}
async function* walkFileTree(fileTree, issues, dsContext) {
  yield* _walkFileTree(fileTree, fileTree, issues, dsContext);
}

// src/validators/psychds.ts
var CHECKS3 = [
  emptyFile,
  filenameIdentify,
  filenameValidate,
  applyRules
];
async function validate(fileTree, options) {
  const summary = new Summary();
  const schema = await loadSchema(options.schema);
  const issues = new DatasetIssues(schema);
  summary.schemaVersion = schema.schema_version;
  const ddFile = fileTree.files.find(
    (file) => file.name === "dataset_description.json"
  );
  let dsContext;
  if (ddFile) {
    try {
      const description = ddFile.expanded;
      dsContext = new psychDSContextDataset(options, ddFile, description);
    } catch (_error) {
      dsContext = new psychDSContextDataset(options, ddFile);
      issues.addSchemaIssue(
        "InvalidJsonFormatting",
        [ddFile]
      );
    }
  } else {
    dsContext = new psychDSContextDataset(options);
  }
  const rulesRecord = {};
  findFileRules(schema, rulesRecord);
  for await (const context of walkFileTree(fileTree, issues, dsContext)) {
    if (context.file.issueInfo.length > 0) {
      context.file.issueInfo.forEach((iss) => {
        issues.addSchemaIssue(
          iss.key,
          [{
            ...context.file,
            evidence: iss.evidence ? iss.evidence : ""
          }]
        );
      });
    }
    if (context.file.ignored) {
      continue;
    }
    await context.asyncLoads();
    if (context.extension === ".csv") {
      summary.suggestedColumns = [.../* @__PURE__ */ new Set([...summary.suggestedColumns, ...Object.keys(context.columns)])];
    }
    for (const check of CHECKS3) {
      await check(schema, context);
    }
    for (const rule of context.filenameRules) {
      rulesRecord[rule] = true;
    }
    await summary.update(context);
  }
  checkDirRules(schema, rulesRecord, dsContext.baseDirs);
  checkMissingRules(schema, rulesRecord, issues);
  issues.filterIssues(rulesRecord);
  const output = {
    valid: [...issues.values()].filter((issue) => issue.severity === "error").length === 0,
    issues,
    summary: summary.formatOutput()
  };
  return output;
}

// src/deps/prettyBytes.ts
import { prettyBytes } from "https://deno.land/x/pretty_bytes@v2.0.0/mod.ts";

// src/deps/fmt.ts
import * as colors from "https://deno.land/std@0.177.0/fmt/colors.ts";

// src/utils/output.ts
function consoleFormat(result, options) {
  const output = [];
  const errors = [...result.issues.values()].filter((issue) => issue.severity === "error");
  const warnings = [...result.issues.values()].filter((issue) => issue.severity === "warning");
  const csv_issue = [...result.issues.values()].filter((issue) => issue.key === "CSV_COLUMN_MISSING").length === 1;
  if (errors.length === 0) {
    output.push(colors.green(`
        **********************************************
        This dataset appears to be psych-DS compatible
        **********************************************
`));
    if (options?.showWarnings) {
      warnings.forEach((issue) => output.push(formatIssue(issue, options)));
    }
  } else {
    output.push(colors.red(`
        ******************************************************
        This dataset does not appear to be psych-DS compatible
        ******************************************************
`));
    errors.forEach((issue) => output.push(formatIssue(issue, options)));
    if (options?.showWarnings) {
      warnings.forEach((issue) => output.push(formatIssue(issue, options)));
    }
  }
  if (csv_issue) {
    output.push("");
    output.push(`There was an issue with your variableMeasured value. Here is a suggested value:`);
    output.push("");
    output.push(JSON.stringify(result.summary.suggestedColumns));
  }
  output.push("");
  output.push(formatSummary(result.summary));
  output.push("");
  return output.join("\n");
}
function formatIssue(issue, options) {
  const severity = issue.severity;
  const color = severity === "error" ? "red" : "yellow";
  const output = [];
  output.push(
    "	" + colors[color](
      `[${severity.toUpperCase()}] ${issue.reason} (${issue.key})`
    )
  );
  output.push("");
  let fileOutCount = 0;
  issue.files.forEach((file) => {
    if (!options?.verbose && fileOutCount > 2) {
      return;
    }
    output.push("		." + file.path);
    if (file.line) {
      let msg = "			@ line: " + file.line;
      if (file.character) {
        msg += " character: " + file.character;
      }
      output.push(msg);
    }
    if (file.evidence) {
      output.push("			Evidence: " + file.evidence);
    }
    fileOutCount++;
  });
  if (!options?.verbose) {
    output.push("");
    output.push("		" + issue.files.size + " more files with the same issue");
  }
  output.push("");
  return output.join("\n");
}
function formatSummary(summary) {
  const output = [];
  const column1 = [
    summary.totalFiles + " Files, " + prettyBytes(summary.size)
  ];
  const pad = "       ";
  const headers = [
    pad,
    colors.magenta("Summary:") + pad
  ];
  const rows = [];
  for (let i = 0; i < column1.length; i++) {
    const val1 = column1[i] ? column1[i] + pad : "";
    rows.push([pad, val1]);
  }
  const table = new Table().header(headers).body(rows).border(false).padding(1).indent(2).toString();
  output.push(table);
  output.push("");
  output.push(
    colors.cyan(
      "	If you have any questions, please post on https://neurostars.org/tags/bids."
    )
  );
  return output.join("\n");
}

// src/types/filetree.ts
var FileTree = class {
  // Relative path to this FileTree location
  path;
  // Name of this directory level
  name;
  files;
  directories;
  parent;
  constructor(path, name, parent) {
    this.path = path;
    this.files = [];
    this.directories = [];
    this.name = name;
    this.parent = parent;
  }
  contains(parts) {
    if (parts.length === 0) {
      return false;
    } else if (parts.length === 1) {
      return this.files.some((x) => x.name === parts[0]);
    } else if (parts.length > 1) {
      const nextDir = this.directories.find((x) => x.name === parts[0]);
      if (nextDir) {
        return nextDir.contains(parts.slice(1, parts.length));
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
};

// src/setup/requestPermissions.ts
var globalRead = { name: "read" };
async function requestPermission(permission) {
  const status = await Deno.permissions.request(permission);
  if (status.state === "granted") {
    return true;
  } else {
    return false;
  }
}
var requestReadPermission = () => requestPermission(globalRead);

// src/deps/ignore.ts
function makeArray(subject) {
  return Array.isArray(subject) ? subject : [subject];
}
var EMPTY = "";
var SPACE = " ";
var ESCAPE = "\\";
var REGEX_TEST_BLANK_LINE = /^\s+$/;
var REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
var REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
var REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
var REGEX_SPLITALL_CRLF = /\r?\n/g;
var REGEX_TEST_INVALID_PATH = /^\.*\/|^\.+$/;
var SLASH = "/";
var TMP_KEY_IGNORE = "node-ignore";
if (typeof Symbol !== "undefined") {
  TMP_KEY_IGNORE = Symbol.for("node-ignore");
}
var KEY_IGNORE = TMP_KEY_IGNORE;
var define = (object, key, value) => Object.defineProperty(object, key, { value });
var REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
var RETURN_FALSE = () => false;
var sanitizeRange = (range) => range.replace(
  REGEX_REGEXP_RANGE,
  (match, from, to) => from.charCodeAt(0) <= to.charCodeAt(0) ? match : (
    // Invalid range (out of order) which is ok for gitignore rules but
    //   fatal for JavaScript regular expression, so eliminate it.
    EMPTY
  )
);
var cleanRangeBackSlash = (slashes) => {
  const { length } = slashes;
  return slashes.slice(0, length - length % 2);
};
var REPLACERS = [
  // > Trailing spaces are ignored unless they are quoted with backslash ("\")
  [
    // (a\ ) -> (a )
    // (a  ) -> (a)
    // (a \ ) -> (a  )
    /\\?\s+$/,
    (match) => match.indexOf("\\") === 0 ? SPACE : EMPTY
  ],
  // replace (\ ) with ' '
  [/\\\s/g, () => SPACE],
  // Escape metacharacters
  // which is written down by users but means special for regular expressions.
  // > There are 12 characters with special meanings:
  // > - the backslash \,
  // > - the caret ^,
  // > - the dollar sign $,
  // > - the period or dot .,
  // > - the vertical bar or pipe symbol |,
  // > - the question mark ?,
  // > - the asterisk or star *,
  // > - the plus sign +,
  // > - the opening parenthesis (,
  // > - the closing parenthesis ),
  // > - and the opening square bracket [,
  // > - the opening curly brace {,
  // > These special characters are often called "metacharacters".
  [/[\\$.|*+(){^]/g, (match) => `\\${match}`],
  [
    // > a question mark (?) matches a single character
    /(?!\\)\?/g,
    () => "[^/]"
  ],
  // leading slash
  [
    // > A leading slash matches the beginning of the pathname.
    // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
    // A leading slash matches the beginning of the pathname
    /^\//,
    () => "^"
  ],
  // replace special metacharacter slash after the leading slash
  [/\//g, () => "\\/"],
  [
    // > A leading "**" followed by a slash means match in all directories.
    // > For example, "**/foo" matches file or directory "foo" anywhere,
    // > the same as pattern "foo".
    // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
    // >   under directory "foo".
    // Notice that the '*'s have been replaced as '\\*'
    /^\^*\\\*\\\*\\\//,
    // '**/foo' <-> 'foo'
    () => "^(?:.*\\/)?"
  ],
  // starting
  [
    // there will be no leading '/'
    //   (which has been replaced by section "leading slash")
    // If starts with '**', adding a '^' to the regular expression also works
    /^(?=[^^])/,
    function startingReplacer() {
      return !/\/(?!$)/.test(this) ? (
        // > Prior to 2.22.1
        // > If the pattern does not contain a slash /,
        // >   Git treats it as a shell glob pattern
        // Actually, if there is only a trailing slash,
        //   git also treats it as a shell glob pattern
        // After 2.22.1 (compatible but clearer)
        // > If there is a separator at the beginning or middle (or both)
        // > of the pattern, then the pattern is relative to the directory
        // > level of the particular .gitignore file itself.
        // > Otherwise the pattern may also match at any level below
        // > the .gitignore level.
        "(?:^|\\/)"
      ) : (
        // > Otherwise, Git treats the pattern as a shell glob suitable for
        // >   consumption by fnmatch(3)
        "^"
      );
    }
  ],
  // two globstars
  [
    // Use lookahead assertions so that we could match more than one `'/**'`
    /\\\/\\\*\\\*(?=\\\/|$)/g,
    // Zero, one or several directories
    // should not use '*', or it will be replaced by the next replacer
    // Check if it is not the last `'/**'`
    (_, index, str) => index + 6 < str.length ? (
      // case: /**/
      // > A slash followed by two consecutive asterisks then a slash matches
      // >   zero or more directories.
      // > For example, "a/**/b" matches "a/b", "a/x/b", "a/x/y/b" and so on.
      // '/**/'
      "(?:\\/[^\\/]+)*"
    ) : (
      // case: /**
      // > A trailing `"/**"` matches everything inside.
      // #21: everything inside but it should not include the current folder
      "\\/.+"
    )
  ],
  // normal intermediate wildcards
  [
    // Never replace escaped '*'
    // ignore rule '\*' will match the path '*'
    // 'abc.*/' -> go
    // 'abc.*'  -> skip this rule,
    //    coz trailing single wildcard will be handed by [trailing wildcard]
    /(^|[^\\]+)(\\\*)+(?=.+)/g,
    // '*.js' matches '.js'
    // '*.js' doesn't match 'abc'
    (_, p1, p2) => {
      const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
      return p1 + unescaped;
    }
  ],
  [
    // unescape, revert step 3 except for back slash
    // For example, if a user escape a '\\*',
    // after step 3, the result will be '\\\\\\*'
    /\\\\\\(?=[$.|*+(){^])/g,
    () => ESCAPE
  ],
  [
    // '\\\\' -> '\\'
    /\\\\/g,
    () => ESCAPE
  ],
  [
    // > The range notation, e.g. [a-zA-Z],
    // > can be used to match one of the characters in a range.
    // `\` is escaped by step 3
    /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
    (match, leadEscape, range, endEscape, close) => leadEscape === ESCAPE ? (
      // '\\[bar]' -> '\\\\[bar\\]'
      `\\[${range}${cleanRangeBackSlash(endEscape)}${close}`
    ) : close === "]" ? endEscape.length % 2 === 0 ? (
      // A normal case, and it is a range notation
      // '[bar]'
      // '[bar\\\\]'
      `[${sanitizeRange(range)}${endEscape}]`
    ) : (
      // Invalid range notaton
      // '[bar\\]' -> '[bar\\\\]'
      "[]"
    ) : "[]"
  ],
  // ending
  [
    // 'js' will not match 'js.'
    // 'ab' will not match 'abc'
    /(?:[^*])$/,
    // WTF!
    // https://git-scm.com/docs/gitignore
    // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
    // which re-fixes #24, #38
    // > If there is a separator at the end of the pattern then the pattern
    // > will only match directories, otherwise the pattern can match both
    // > files and directories.
    // 'js*' will not match 'a.js'
    // 'js/' will not match 'a.js'
    // 'js' will match 'a.js' and 'a.js/'
    (match) => /\/$/.test(match) ? (
      // foo/ will not match 'foo'
      `${match}$`
    ) : (
      // foo matches 'foo' and 'foo/'
      `${match}(?=$|\\/$)`
    )
  ],
  // trailing wildcard
  [
    /(\^|\\\/)?\\\*$/,
    (_, p1) => {
      const prefix = p1 ? (
        // '\^':
        // '/*' does not match EMPTY
        // '/*' does not match everything
        // '\\\/':
        // 'abc/*' does not match 'abc/'
        `${p1}[^/]+`
      ) : (
        // 'a*' matches 'a'
        // 'a*' matches 'aa'
        "[^/]*"
      );
      return `${prefix}(?=$|\\/$)`;
    }
  ]
];
var regexCache = /* @__PURE__ */ Object.create(null);
var makeRegex = (pattern, ignoreCase) => {
  let source = regexCache[pattern];
  if (!source) {
    source = REPLACERS.reduce(
      (prev, current) => prev.replace(current[0], current[1].bind(pattern)),
      pattern
    );
    regexCache[pattern] = source;
  }
  return ignoreCase ? new RegExp(source, "i") : new RegExp(source);
};
var isString = (subject) => typeof subject === "string";
var checkPattern = (pattern) => pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && // > A line starting with # serves as a comment.
pattern.indexOf("#") !== 0;
var splitPattern = (pattern) => pattern.split(REGEX_SPLITALL_CRLF);
var IgnoreRule = class {
  constructor(origin, pattern, negative, regex) {
    this.origin = origin;
    this.pattern = pattern;
    this.negative = negative;
    this.regex = regex;
  }
};
var createRule = (pattern, ignoreCase) => {
  const origin = pattern;
  let negative = false;
  if (pattern.indexOf("!") === 0) {
    negative = true;
    pattern = pattern.substr(1);
  }
  pattern = pattern.replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!").replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
  const regex = makeRegex(pattern, ignoreCase);
  return new IgnoreRule(origin, pattern, negative, regex);
};
var throwError = (message, Ctor) => {
  throw new Ctor(message);
};
var checkPath = (path, originalPath, doThrow) => {
  if (!isString(path)) {
    return doThrow(
      `path must be a string, but got \`${originalPath}\``,
      TypeError
    );
  }
  if (!path) {
    return doThrow(`path must not be empty`, TypeError);
  }
  if (checkPath.isNotRelative(path)) {
    const r = "`path.relative()`d";
    return doThrow(
      `path should be a ${r} string, but got "${originalPath}"`,
      RangeError
    );
  }
  return true;
};
var isNotRelative = (path) => REGEX_TEST_INVALID_PATH.test(path);
checkPath.isNotRelative = isNotRelative;
checkPath.convert = (p) => p;
var Ignore = class {
  constructor({
    ignorecase = true,
    ignoreCase = ignorecase,
    allowRelativePaths = false
  } = {}) {
    define(this, KEY_IGNORE, true);
    this._rules = [];
    this._ignoreCase = ignoreCase;
    this._allowRelativePaths = allowRelativePaths;
    this._initCache();
  }
  _initCache() {
    this._ignoreCache = /* @__PURE__ */ Object.create(null);
    this._testCache = /* @__PURE__ */ Object.create(null);
  }
  _addPattern(pattern) {
    if (pattern && pattern[KEY_IGNORE]) {
      this._rules = this._rules.concat(pattern._rules);
      this._added = true;
      return;
    }
    if (checkPattern(pattern)) {
      const rule = createRule(pattern, this._ignoreCase);
      this._added = true;
      this._rules.push(rule);
    }
  }
  // @param {Array<string> | string | Ignore} pattern
  add(pattern) {
    this._added = false;
    makeArray(isString(pattern) ? splitPattern(pattern) : pattern).forEach(
      this._addPattern,
      this
    );
    if (this._added) {
      this._initCache();
    }
    return this;
  }
  // legacy
  addPattern(pattern) {
    return this.add(pattern);
  }
  //          |           ignored : unignored
  // negative |   0:0   |   0:1   |   1:0   |   1:1
  // -------- | ------- | ------- | ------- | --------
  //     0    |  TEST   |  TEST   |  SKIP   |    X
  //     1    |  TESTIF |  SKIP   |  TEST   |    X
  // - SKIP: always skip
  // - TEST: always test
  // - TESTIF: only test if checkUnignored
  // - X: that never happen
  // @param {boolean} whether should check if the path is unignored,
  //   setting `checkUnignored` to `false` could reduce additional
  //   path matching.
  // @returns {TestResult} true if a file is ignored
  _testOne(path, checkUnignored) {
    let ignored = false;
    let unignored = false;
    this._rules.forEach((rule) => {
      const { negative } = rule;
      if (unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored) {
        return;
      }
      const matched = rule.regex.test(path);
      console.log(`Path: ${path}, Rule: ${rule.pattern}, Matched: ${matched}`);
      if (matched) {
        ignored = !negative;
        unignored = negative;
      }
    });
    return {
      ignored,
      unignored
    };
  }
  // @returns {TestResult}
  _test(originalPath, cache, checkUnignored, slices) {
    const path = originalPath && // Supports nullable path
    checkPath.convert(originalPath);
    checkPath(
      path,
      originalPath,
      this._allowRelativePaths ? RETURN_FALSE : throwError
    );
    return this._t(path, cache, checkUnignored, slices);
  }
  _t(path, cache, checkUnignored, slices) {
    if (path in cache) {
      return cache[path];
    }
    if (!slices) {
      slices = path.split(SLASH);
    }
    slices.pop();
    if (!slices.length) {
      return cache[path] = this._testOne(path, checkUnignored);
    }
    const parent = this._t(
      slices.join(SLASH) + SLASH,
      cache,
      checkUnignored,
      slices
    );
    return cache[path] = parent.ignored ? (
      // > It is not possible to re-include a file if a parent directory of
      // >   that file is excluded.
      parent
    ) : this._testOne(path, checkUnignored);
  }
  ignores(path) {
    return this._test(path, this._ignoreCache, false).ignored;
  }
  createFilter() {
    return (path) => !this.ignores(path);
  }
  filter(paths) {
    return makeArray(paths).filter(this.createFilter());
  }
  // @returns {TestResult}
  test(path) {
    return this._test(path, this._testCache, true);
  }
};
var ignore = (options) => new Ignore(options);
var isPathValid = (path) => checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
ignore.isPathValid = isPathValid;

// src/files/ignore.ts
function readPsychDSIgnore(file) {
  const value = file.fileText;
  if (value) {
    const lines = value.split("\n");
    return lines;
  } else {
    return [];
  }
}
var defaultIgnores = [
  ".git**",
  "*.DS_Store",
  ".datalad/",
  ".reproman/",
  "sourcedata/",
  "code/",
  "stimuli/",
  "materials/",
  "results/",
  "products/",
  "analysis/",
  "documentation/",
  "log/",
  "data/raw/**",
  "data/raw/**/*",
  "data/raw/**/**/*",
  ".psychdsignore"
];
var FileIgnoreRules = class {
  #ignore;
  constructor(config) {
    this.#ignore = ignore({ allowRelativePaths: true });
    this.#ignore.add(defaultIgnores);
    this.#ignore.add(config);
  }
  add(config) {
    this.#ignore.add(config);
  }
  /** Test if a dataset relative path should be ignored given configured rules */
  test(path) {
    console.log(path);
    console.log(this.#ignore.test(path));
    console.log(this.#ignore.ignores(path));
    return this.#ignore.ignores(path);
  }
};

// src/files/deno.ts
import jsonld from "jsonld";
var customDocumentLoader = async (url) => {
  if (url === "https://schema.org/" || url === "http://schema.org/") {
    url = "https://schema.org/docs/jsonldcontext.json";
  }
  const response = await fetch(url, {
    headers: {
      "Accept": "application/ld+json, application/json"
    },
    redirect: "follow"
    // Allow redirects
  });
  const contentType = response.headers.get("content-type");
  if (!contentType || !(contentType.includes("application/ld+json") || contentType.includes("application/json"))) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }
  const document = await response.json();
  return {
    contextUrl: null,
    // Not used in this implementation
    documentUrl: url,
    // The final URL after any redirects
    document
    // The parsed JSON-LD context
  };
};
var UnicodeDecodeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnicodeDecode";
  }
};
var psychDSFileDeno = class {
  #ignore;
  name;
  path;
  expanded;
  issueInfo;
  fileText;
  #fileInfo;
  #datasetAbsPath;
  constructor(datasetPath, path, ignore2) {
    this.#datasetAbsPath = datasetPath;
    this.path = path;
    this.name = basename(path);
    this.fileText = "";
    this.expanded = {};
    this.issueInfo = [];
    this.#ignore = ignore2;
    try {
      this.#fileInfo = Deno.statSync(this._getPath());
    } catch (error2) {
      if (error2.code === "ENOENT") {
        this.#fileInfo = Deno.lstatSync(this._getPath());
      }
    }
  }
  _getPath() {
    return join(this.#datasetAbsPath, this.path);
  }
  get size() {
    return this.#fileInfo ? this.#fileInfo.size : -1;
  }
  get stream() {
    const handle = this.#openHandle();
    return handle.readable;
  }
  get ignored() {
    return this.#ignore.test(this.path);
  }
  /**
   * Read the entire file and decode as utf-8 text
   */
  async text() {
    const streamReader = this.stream.pipeThrough(new TextDecoderStream("utf-8")).getReader();
    let data = "";
    try {
      const { done, value } = await streamReader.read();
      if (value && value.startsWith("\uFFFD")) {
        throw new UnicodeDecodeError("This file appears to be UTF-16");
      }
      if (done)
        return data;
      data += value;
      while (true) {
        const { done: done2, value: value2 } = await streamReader.read();
        if (done2)
          return data;
        data += value2;
      }
    } finally {
      streamReader.releaseLock();
    }
  }
  /**
   * Read bytes in a range efficiently from a given file
   */
  async readBytes(size, offset = 0) {
    const handle = this.#openHandle();
    const buf = new Uint8Array(size);
    await handle.seek(offset, Deno.SeekMode.Start);
    await handle.read(buf);
    handle.close();
    return buf;
  }
  /**
   * Return a Deno file handle
   */
  #openHandle() {
    const openOptions = { read: true, write: false };
    return Deno.openSync(this._getPath(), openOptions);
  }
};
async function _readFileTree(rootPath, relativePath, ignore2, parent, context) {
  await requestReadPermission();
  const name = basename(relativePath);
  const tree = new FileTree(relativePath, name, parent);
  if (!parent) {
    for await (const dirEntry of Deno.readDir(join(rootPath, relativePath))) {
      if (dirEntry.isFile && dirEntry.name === "dataset_description.json") {
        const file = new psychDSFileDeno(
          rootPath,
          join(relativePath, dirEntry.name),
          ignore2
        );
        file.fileText = (await file.text()).replaceAll("http://schema.org", "https://schema.org").replaceAll("http://www.schema.org", "https://www.schema.org");
        const json = await JSON.parse(file.fileText);
        if ("@context" in json) {
          context = json["@context"];
        }
      }
    }
  }
  for await (const dirEntry of Deno.readDir(join(rootPath, relativePath))) {
    if (dirEntry.isFile || dirEntry.isSymlink) {
      const file = new psychDSFileDeno(
        rootPath,
        join(relativePath, dirEntry.name),
        ignore2
      );
      file.fileText = (await file.text()).replaceAll("http://schema.org", "https://schema.org").replaceAll("http://www.schema.org", "https://www.schema.org");
      if (dirEntry.name === ".psychdsignore") {
        ignore2.add(readPsychDSIgnore(file));
      }
      if (dirEntry.name.endsWith(".json")) {
        let json = {};
        let exp = [];
        try {
          json = await JSON.parse(file.fileText);
          if (context && !dirEntry.name.endsWith("dataset_description.json")) {
            json = {
              ...json,
              "@context": context
            };
          }
        } catch (_error) {
          file.issueInfo.push({
            key: "InvalidJsonFormatting"
          });
        }
        try {
          exp = await jsonld.expand(json, {
            documentLoader: customDocumentLoader
          });
          if (exp.length > 0)
            file.expanded = exp[0];
        } catch (error2) {
          file.issueInfo.push({
            key: "InvalidJsonldSyntax",
            evidence: `${error2.message.split(";")[1]}`
          });
        }
      }
      tree.files.push(file);
    }
    if (dirEntry.isDirectory) {
      const dirTree = await _readFileTree(
        rootPath,
        join(relativePath, dirEntry.name),
        ignore2,
        tree,
        context
      );
      tree.directories.push(dirTree);
    }
  }
  return tree;
}
function readFileTree(rootPath) {
  const ignore2 = new FileIgnoreRules([]);
  return _readFileTree(rootPath, "/", ignore2);
}

// src/main.ts
async function main() {
  const options = await parseOptions(Deno.args);
  setupLogging(options.debug);
  const absolutePath = resolve(options.datasetPath);
  const tree = await readFileTree(absolutePath);
  const schemaResult = await validate(tree, options);
  if (options.json) {
    console.log(
      JSON.stringify(schemaResult, (_, value) => {
        if (value instanceof Map) {
          return Array.from(value.values());
        } else {
          return value;
        }
      })
    );
  } else {
    console.log(
      consoleFormat(schemaResult, {
        verbose: options.verbose ? options.verbose : false,
        showWarnings: options.showWarnings ? options.showWarnings : false
      })
    );
  }
  Deno.exit(0);
}

// src/psychds-validator.ts
await main();
