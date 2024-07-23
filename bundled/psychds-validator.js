// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const emptyFile = (_schema, context)=>{
    if (context.file.size === 0) {
        context.issues.addSchemaIssue('EmptyFile', [
            context.file
        ]);
    }
    return Promise.resolve();
};
const CHECKS = [
    findRuleMatches
];
async function filenameIdentify(schema, context) {
    for (const check of CHECKS){
        await check(schema, context);
    }
}
function checkDirRules(schema, rulesRecord, baseDirs) {
    Object.keys(rulesRecord).filter((key)=>{
        return key.startsWith('rules.files.common.core') && !rulesRecord[key];
    }).map((key)=>{
        const node = schema[key];
        if (node.directory === true && baseDirs.includes(node.path)) rulesRecord[key] = true;
    });
}
function findFileRules(schema, rulesRecord) {
    const schemaPath = 'rules.files';
    Object.keys(schema[schemaPath]).map((key)=>{
        const path = `${schemaPath}.${key}`;
        _findFileRules(schema[path], path, rulesRecord);
    });
    return Promise.resolve();
}
function _findFileRules(node, path, rulesRecord) {
    if ('baseDir' in node && 'extensions' in node && ('suffix' in node || 'stem' in node)) {
        rulesRecord[path] = false;
        return;
    }
    if ('path' in node && 'directory' in node) {
        rulesRecord[path] = false;
        return;
    } else {
        Object.keys(node).map((key)=>{
            if (typeof node[key] === 'object') {
                _findFileRules(node[key], `${path}.${key}`, rulesRecord);
            }
        });
    }
}
function findRuleMatches(schema, context) {
    const schemaPath = 'rules.files';
    Object.keys(schema[schemaPath]).map((key)=>{
        const path = `${schemaPath}.${key}`;
        _findRuleMatches(schema[path], path, context);
    });
    if (context.filenameRules.length === 0 && context.file.path !== '/.bidsignore') {
        context.issues.addSchemaIssue('NotIncluded', [
            context.file
        ]);
        if (context.file.name === "dataset_description.json") {
            context.issues.addSchemaIssue("WrongMetadataLocation", [
                context.file
            ], `You have placed a file called "dataset_description.json" within the ${context.baseDir} 
        subDirectory. Such files are only valid when placed in the root directory.`);
        }
    }
    return Promise.resolve();
}
function checkFileRules(arbitraryNesting, hasSuffix, node, context) {
    let baseDirCond = null;
    let suffixStemCond = null;
    if (arbitraryNesting) baseDirCond = context.baseDir === node.baseDir;
    else {
        if (context.baseDir === "/") baseDirCond = context.path === `/${context.file.name}`;
        else baseDirCond = context.path === `/${node.baseDir}/${context.file.name}`;
    }
    if (hasSuffix) suffixStemCond = context.suffix === node.suffix;
    else suffixStemCond = context.file.name.startsWith(node.stem);
    if (baseDirCond && node.extensions.includes(context.extension) && suffixStemCond) return true;
    else return false;
}
function _findRuleMatches(node, path, context) {
    if ('arbitraryNesting' in node) {
        if (checkFileRules(node.arbitraryNesting, 'suffix' in node, node, context)) {
            context.filenameRules.push(path);
            return;
        }
    } else {
        Object.keys(node).map((key)=>{
            if (typeof node[key] === 'object') {
                _findRuleMatches(node[key], `${path}.${key}`, context);
            }
        });
    }
}
class Issue {
    key;
    severity;
    reason;
    requires;
    files;
    constructor({ key, severity, reason, requires, files }){
        this.key = key;
        this.severity = severity;
        this.reason = reason;
        this.requires = requires;
        if (Array.isArray(files)) {
            this.files = new Map();
            for (const f of files){
                this.files.set(f.path, f);
            }
        } else {
            this.files = files;
        }
    }
    get helpUrl() {
        return `https://neurostars.org/search?q=${this.key}`;
    }
}
const CODE_DEPRECATED = Number.MIN_SAFE_INTEGER;
const issueFile = (issue, f)=>{
    const evidence = f.evidence || '';
    const reason = issue.reason || '';
    const line = f.line || 0;
    const character = f.character || 0;
    return {
        key: issue.key,
        code: CODE_DEPRECATED,
        file: {
            path: f.path,
            name: f.name,
            relativePath: f.path
        },
        evidence,
        line,
        character,
        severity: issue.severity,
        reason,
        helpUrl: issue.helpUrl
    };
};
class DatasetIssues extends Map {
    schema;
    constructor(schema){
        super();
        this.schema = schema ? schema : {};
    }
    add({ key, reason, severity = 'error', requires = [], files = [] }) {
        const existingIssue = this.get(key);
        if (existingIssue) {
            for (const f of files){
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
    hasIssue({ key }) {
        if (this.has(key)) {
            return true;
        }
        return false;
    }
    addSchemaIssue(key, files) {
        if (this.schema) {
            this.add({
                key: this.schema[`rules.errors.${key}.code`],
                reason: this.schema[`rules.errors.${key}.reason`],
                severity: this.schema[`rules.errors.${key}.level`],
                requires: this.schema[`rules.errors.${key}.requires`],
                files: files
            });
        }
    }
    fileInIssues(path) {
        const matchingIssues = [];
        for (const [_, issue] of this){
            if (issue.files.get(path)) {
                matchingIssues.push(issue);
            }
        }
        return matchingIssues;
    }
    getFileIssueKeys(path) {
        return this.fileInIssues(path).map((issue)=>issue.key);
    }
    filterIssues(rulesRecord) {
        for (const [_, issue] of this){
            if (!issue.requires.every((req)=>rulesRecord[req])) {
                this.delete(_);
            }
        }
    }
    formatOutput() {
        const output = {
            errors: [],
            warnings: []
        };
        for (const [_, issue] of this){
            const outputIssue = {
                severity: issue.severity,
                key: issue.key,
                code: CODE_DEPRECATED,
                additionalFileCount: 0,
                reason: issue.reason,
                files: Array.from(issue.files.values()).map((f)=>issueFile(issue, f)),
                helpUrl: issue.helpUrl
            };
            if (issue.severity === 'warning') {
                output.warnings.push(outputIssue);
            } else {
                output.errors.push(outputIssue);
            }
        }
        return output;
    }
}
const osType = (()=>{
    const { Deno: Deno1 } = globalThis;
    if (typeof Deno1?.build?.os === "string") {
        return Deno1.build.os;
    }
    const { navigator } = globalThis;
    if (navigator?.appVersion?.includes?.("Win")) {
        return "windows";
    }
    return "linux";
})();
const isWindows = osType === "windows";
const CHAR_FORWARD_SLASH = 47;
function assertPath(path) {
    if (typeof path !== "string") {
        throw new TypeError(`Path must be a string. Received ${JSON.stringify(path)}`);
    }
}
function isPosixPathSeparator(code) {
    return code === 47;
}
function isPathSeparator(code) {
    return isPosixPathSeparator(code) || code === 92;
}
function isWindowsDeviceRoot(code) {
    return code >= 97 && code <= 122 || code >= 65 && code <= 90;
}
function normalizeString(path, allowAboveRoot, separator, isPathSeparator) {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code;
    for(let i = 0, len = path.length; i <= len; ++i){
        if (i < len) code = path.charCodeAt(i);
        else if (isPathSeparator(code)) break;
        else code = CHAR_FORWARD_SLASH;
        if (isPathSeparator(code)) {
            if (lastSlash === i - 1 || dots === 1) {} else if (lastSlash !== i - 1 && dots === 2) {
                if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(separator);
                        if (lastSlashIndex === -1) {
                            res = "";
                            lastSegmentLength = 0;
                        } else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    } else if (res.length === 2 || res.length === 1) {
                        res = "";
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    if (res.length > 0) res += `${separator}..`;
                    else res = "..";
                    lastSegmentLength = 2;
                }
            } else {
                if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
                else res = path.slice(lastSlash + 1, i);
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        } else if (code === 46 && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return res;
}
function _format(sep, pathObject) {
    const dir = pathObject.dir || pathObject.root;
    const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
    if (!dir) return base;
    if (base === sep) return dir;
    if (dir === pathObject.root) return dir + base;
    return dir + sep + base;
}
const WHITESPACE_ENCODINGS = {
    "\u0009": "%09",
    "\u000A": "%0A",
    "\u000B": "%0B",
    "\u000C": "%0C",
    "\u000D": "%0D",
    "\u0020": "%20"
};
function encodeWhitespace(string) {
    return string.replaceAll(/[\s]/g, (c)=>{
        return WHITESPACE_ENCODINGS[c] ?? c;
    });
}
function lastPathSegment(path, isSep, start = 0) {
    let matchedNonSeparator = false;
    let end = path.length;
    for(let i = path.length - 1; i >= start; --i){
        if (isSep(path.charCodeAt(i))) {
            if (matchedNonSeparator) {
                start = i + 1;
                break;
            }
        } else if (!matchedNonSeparator) {
            matchedNonSeparator = true;
            end = i + 1;
        }
    }
    return path.slice(start, end);
}
function stripTrailingSeparators(segment, isSep) {
    if (segment.length <= 1) {
        return segment;
    }
    let end = segment.length;
    for(let i = segment.length - 1; i > 0; i--){
        if (isSep(segment.charCodeAt(i))) {
            end = i;
        } else {
            break;
        }
    }
    return segment.slice(0, end);
}
function stripSuffix(name, suffix) {
    if (suffix.length >= name.length) {
        return name;
    }
    const lenDiff = name.length - suffix.length;
    for(let i = suffix.length - 1; i >= 0; --i){
        if (name.charCodeAt(lenDiff + i) !== suffix.charCodeAt(i)) {
            return name;
        }
    }
    return name.slice(0, -suffix.length);
}
class DenoStdInternalError extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError(msg);
    }
}
const sep = "\\";
const delimiter = ";";
function resolve(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1; i--){
        let path;
        const { Deno: Deno1 } = globalThis;
        if (i >= 0) {
            path = pathSegments[i];
        } else if (!resolvedDevice) {
            if (typeof Deno1?.cwd !== "function") {
                throw new TypeError("Resolved a drive-letter-less path without a CWD.");
            }
            path = Deno1.cwd();
        } else {
            if (typeof Deno1?.env?.get !== "function" || typeof Deno1?.cwd !== "function") {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno1.cwd();
            if (path === undefined || path.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`) {
                path = `${resolvedDevice}\\`;
            }
        }
        assertPath(path);
        const len = path.length;
        if (len === 0) continue;
        let rootEnd = 0;
        let device = "";
        let isAbsolute = false;
        const code = path.charCodeAt(0);
        if (len > 1) {
            if (isPathSeparator(code)) {
                isAbsolute = true;
                if (isPathSeparator(path.charCodeAt(1))) {
                    let j = 2;
                    let last = j;
                    for(; j < len; ++j){
                        if (isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        const firstPart = path.slice(last, j);
                        last = j;
                        for(; j < len; ++j){
                            if (!isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j < len && j !== last) {
                            last = j;
                            for(; j < len; ++j){
                                if (isPathSeparator(path.charCodeAt(j))) break;
                            }
                            if (j === len) {
                                device = `\\\\${firstPart}\\${path.slice(last)}`;
                                rootEnd = j;
                            } else if (j !== last) {
                                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                                rootEnd = j;
                            }
                        }
                    }
                } else {
                    rootEnd = 1;
                }
            } else if (isWindowsDeviceRoot(code)) {
                if (path.charCodeAt(1) === 58) {
                    device = path.slice(0, 2);
                    rootEnd = 2;
                    if (len > 2) {
                        if (isPathSeparator(path.charCodeAt(2))) {
                            isAbsolute = true;
                            rootEnd = 3;
                        }
                    }
                }
            }
        } else if (isPathSeparator(code)) {
            rootEnd = 1;
            isAbsolute = true;
        }
        if (device.length > 0 && resolvedDevice.length > 0 && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
        }
        if (resolvedDevice.length === 0 && device.length > 0) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
            resolvedAbsolute = isAbsolute;
        }
        if (resolvedAbsolute && resolvedDevice.length > 0) break;
    }
    resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator);
    return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
function normalize(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = 0;
    let device;
    let isAbsolute = false;
    const code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            isAbsolute = true;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    const firstPart = path.slice(last, j);
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return `\\\\${firstPart}\\${path.slice(last)}\\`;
                        } else if (j !== last) {
                            device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                            rootEnd = j;
                        }
                    }
                }
            } else {
                rootEnd = 1;
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                device = path.slice(0, 2);
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        isAbsolute = true;
                        rootEnd = 3;
                    }
                }
            }
        }
    } else if (isPathSeparator(code)) {
        return "\\";
    }
    let tail;
    if (rootEnd < len) {
        tail = normalizeString(path.slice(rootEnd), !isAbsolute, "\\", isPathSeparator);
    } else {
        tail = "";
    }
    if (tail.length === 0 && !isAbsolute) tail = ".";
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
        tail += "\\";
    }
    if (device === undefined) {
        if (isAbsolute) {
            if (tail.length > 0) return `\\${tail}`;
            else return "\\";
        } else if (tail.length > 0) {
            return tail;
        } else {
            return "";
        }
    } else if (isAbsolute) {
        if (tail.length > 0) return `${device}\\${tail}`;
        else return `${device}\\`;
    } else if (tail.length > 0) {
        return device + tail;
    } else {
        return device;
    }
}
function isAbsolute(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return false;
    const code = path.charCodeAt(0);
    if (isPathSeparator(code)) {
        return true;
    } else if (isWindowsDeviceRoot(code)) {
        if (len > 2 && path.charCodeAt(1) === 58) {
            if (isPathSeparator(path.charCodeAt(2))) return true;
        }
    }
    return false;
}
function join(...paths) {
    const pathsCount = paths.length;
    if (pathsCount === 0) return ".";
    let joined;
    let firstPart = null;
    for(let i = 0; i < pathsCount; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (joined === undefined) joined = firstPart = path;
            else joined += `\\${path}`;
        }
    }
    if (joined === undefined) return ".";
    let needsReplace = true;
    let slashCount = 0;
    assert(firstPart != null);
    if (isPathSeparator(firstPart.charCodeAt(0))) {
        ++slashCount;
        const firstLen = firstPart.length;
        if (firstLen > 1) {
            if (isPathSeparator(firstPart.charCodeAt(1))) {
                ++slashCount;
                if (firstLen > 2) {
                    if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
                    else {
                        needsReplace = false;
                    }
                }
            }
        }
    }
    if (needsReplace) {
        for(; slashCount < joined.length; ++slashCount){
            if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
        }
        if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
    }
    return normalize(joined);
}
function relative(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    const fromOrig = resolve(from);
    const toOrig = resolve(to);
    if (fromOrig === toOrig) return "";
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) return "";
    let fromStart = 0;
    let fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (from.charCodeAt(fromStart) !== 92) break;
    }
    for(; fromEnd - 1 > fromStart; --fromEnd){
        if (from.charCodeAt(fromEnd - 1) !== 92) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    let toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (to.charCodeAt(toStart) !== 92) break;
    }
    for(; toEnd - 1 > toStart; --toEnd){
        if (to.charCodeAt(toEnd - 1) !== 92) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (to.charCodeAt(toStart + i) === 92) {
                    return toOrig.slice(toStart + i + 1);
                } else if (i === 2) {
                    return toOrig.slice(toStart + i);
                }
            }
            if (fromLen > length) {
                if (from.charCodeAt(fromStart + i) === 92) {
                    lastCommonSep = i;
                } else if (i === 2) {
                    lastCommonSep = 3;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (fromCode === 92) lastCommonSep = i;
    }
    if (i !== length && lastCommonSep === -1) {
        return toOrig;
    }
    let out = "";
    if (lastCommonSep === -1) lastCommonSep = 0;
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || from.charCodeAt(i) === 92) {
            if (out.length === 0) out += "..";
            else out += "\\..";
        }
    }
    if (out.length > 0) {
        return out + toOrig.slice(toStart + lastCommonSep, toEnd);
    } else {
        toStart += lastCommonSep;
        if (toOrig.charCodeAt(toStart) === 92) ++toStart;
        return toOrig.slice(toStart, toEnd);
    }
}
function toNamespacedPath(path) {
    if (typeof path !== "string") return path;
    if (path.length === 0) return "";
    const resolvedPath = resolve(path);
    if (resolvedPath.length >= 3) {
        if (resolvedPath.charCodeAt(0) === 92) {
            if (resolvedPath.charCodeAt(1) === 92) {
                const code = resolvedPath.charCodeAt(2);
                if (code !== 63 && code !== 46) {
                    return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
                }
            }
        } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0))) {
            if (resolvedPath.charCodeAt(1) === 58 && resolvedPath.charCodeAt(2) === 92) {
                return `\\\\?\\${resolvedPath}`;
            }
        }
    }
    return path;
}
function dirname(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) return ".";
    let rootEnd = -1;
    let end = -1;
    let matchedSlash = true;
    let offset = 0;
    const code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            rootEnd = offset = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            return path;
                        }
                        if (j !== last) {
                            rootEnd = offset = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = offset = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
                }
            }
        }
    } else if (isPathSeparator(code)) {
        return path;
    }
    for(let i = len - 1; i >= offset; --i){
        if (isPathSeparator(path.charCodeAt(i))) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        if (rootEnd === -1) return ".";
        else end = rootEnd;
    }
    return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator);
}
function basename(path, suffix = "") {
    assertPath(path);
    if (path.length === 0) return path;
    if (typeof suffix !== "string") {
        throw new TypeError(`Suffix must be a string. Received ${JSON.stringify(suffix)}`);
    }
    let start = 0;
    if (path.length >= 2) {
        const drive = path.charCodeAt(0);
        if (isWindowsDeviceRoot(drive)) {
            if (path.charCodeAt(1) === 58) start = 2;
        }
    }
    const lastSegment = lastPathSegment(path, isPathSeparator, start);
    const strippedSegment = stripTrailingSeparators(lastSegment, isPathSeparator);
    return suffix ? stripSuffix(strippedSegment, suffix) : strippedSegment;
}
function extname(path) {
    assertPath(path);
    let start = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path.length >= 2 && path.charCodeAt(1) === 58 && isWindowsDeviceRoot(path.charCodeAt(0))) {
        start = startPart = 2;
    }
    for(let i = path.length - 1; i >= start; --i){
        const code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("\\", pathObject);
}
function parse(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    const len = path.length;
    if (len === 0) return ret;
    let rootEnd = 0;
    let code = path.charCodeAt(0);
    if (len > 1) {
        if (isPathSeparator(code)) {
            rootEnd = 1;
            if (isPathSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                for(; j < len; ++j){
                    if (isPathSeparator(path.charCodeAt(j))) break;
                }
                if (j < len && j !== last) {
                    last = j;
                    for(; j < len; ++j){
                        if (!isPathSeparator(path.charCodeAt(j))) break;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        for(; j < len; ++j){
                            if (isPathSeparator(path.charCodeAt(j))) break;
                        }
                        if (j === len) {
                            rootEnd = j;
                        } else if (j !== last) {
                            rootEnd = j + 1;
                        }
                    }
                }
            }
        } else if (isWindowsDeviceRoot(code)) {
            if (path.charCodeAt(1) === 58) {
                rootEnd = 2;
                if (len > 2) {
                    if (isPathSeparator(path.charCodeAt(2))) {
                        if (len === 3) {
                            ret.root = ret.dir = path;
                            ret.base = "\\";
                            return ret;
                        }
                        rootEnd = 3;
                    }
                } else {
                    ret.root = ret.dir = path;
                    return ret;
                }
            }
        }
    } else if (isPathSeparator(code)) {
        ret.root = ret.dir = path;
        ret.base = "\\";
        return ret;
    }
    if (rootEnd > 0) ret.root = path.slice(0, rootEnd);
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= rootEnd; --i){
        code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            ret.base = ret.name = path.slice(startPart, end);
        }
    } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
        ret.ext = path.slice(startDot, end);
    }
    ret.base = ret.base || "\\";
    if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path.slice(0, startPart - 1);
    } else ret.dir = ret.root;
    return ret;
}
function fromFileUrl(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
    if (url.hostname != "") {
        path = `\\\\${url.hostname}${path}`;
    }
    return path;
}
function toFileUrl(path) {
    if (!isAbsolute(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const [, hostname, pathname] = path.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
    if (hostname != null && hostname != "localhost") {
        url.hostname = hostname;
        if (!url.hostname) {
            throw new TypeError("Invalid hostname.");
        }
    }
    return url;
}
const mod = {
    sep: sep,
    delimiter: delimiter,
    resolve: resolve,
    normalize: normalize,
    isAbsolute: isAbsolute,
    join: join,
    relative: relative,
    toNamespacedPath: toNamespacedPath,
    dirname: dirname,
    basename: basename,
    extname: extname,
    format: format,
    parse: parse,
    fromFileUrl: fromFileUrl,
    toFileUrl: toFileUrl
};
const sep1 = "/";
const delimiter1 = ":";
function resolve1(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for(let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--){
        let path;
        if (i >= 0) path = pathSegments[i];
        else {
            const { Deno: Deno1 } = globalThis;
            if (typeof Deno1?.cwd !== "function") {
                throw new TypeError("Resolved a relative path without a CWD.");
            }
            path = Deno1.cwd();
        }
        assertPath(path);
        if (path.length === 0) {
            continue;
        }
        resolvedPath = `${path}/${resolvedPath}`;
        resolvedAbsolute = isPosixPathSeparator(path.charCodeAt(0));
    }
    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator);
    if (resolvedAbsolute) {
        if (resolvedPath.length > 0) return `/${resolvedPath}`;
        else return "/";
    } else if (resolvedPath.length > 0) return resolvedPath;
    else return ".";
}
function normalize1(path) {
    assertPath(path);
    if (path.length === 0) return ".";
    const isAbsolute = isPosixPathSeparator(path.charCodeAt(0));
    const trailingSeparator = isPosixPathSeparator(path.charCodeAt(path.length - 1));
    path = normalizeString(path, !isAbsolute, "/", isPosixPathSeparator);
    if (path.length === 0 && !isAbsolute) path = ".";
    if (path.length > 0 && trailingSeparator) path += "/";
    if (isAbsolute) return `/${path}`;
    return path;
}
function isAbsolute1(path) {
    assertPath(path);
    return path.length > 0 && isPosixPathSeparator(path.charCodeAt(0));
}
function join1(...paths) {
    if (paths.length === 0) return ".";
    let joined;
    for(let i = 0, len = paths.length; i < len; ++i){
        const path = paths[i];
        assertPath(path);
        if (path.length > 0) {
            if (!joined) joined = path;
            else joined += `/${path}`;
        }
    }
    if (!joined) return ".";
    return normalize1(joined);
}
function relative1(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";
    from = resolve1(from);
    to = resolve1(to);
    if (from === to) return "";
    let fromStart = 1;
    const fromEnd = from.length;
    for(; fromStart < fromEnd; ++fromStart){
        if (!isPosixPathSeparator(from.charCodeAt(fromStart))) break;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    const toEnd = to.length;
    for(; toStart < toEnd; ++toStart){
        if (!isPosixPathSeparator(to.charCodeAt(toStart))) break;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for(; i <= length; ++i){
        if (i === length) {
            if (toLen > length) {
                if (isPosixPathSeparator(to.charCodeAt(toStart + i))) {
                    return to.slice(toStart + i + 1);
                } else if (i === 0) {
                    return to.slice(toStart + i);
                }
            } else if (fromLen > length) {
                if (isPosixPathSeparator(from.charCodeAt(fromStart + i))) {
                    lastCommonSep = i;
                } else if (i === 0) {
                    lastCommonSep = 0;
                }
            }
            break;
        }
        const fromCode = from.charCodeAt(fromStart + i);
        const toCode = to.charCodeAt(toStart + i);
        if (fromCode !== toCode) break;
        else if (isPosixPathSeparator(fromCode)) lastCommonSep = i;
    }
    let out = "";
    for(i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i){
        if (i === fromEnd || isPosixPathSeparator(from.charCodeAt(i))) {
            if (out.length === 0) out += "..";
            else out += "/..";
        }
    }
    if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
    else {
        toStart += lastCommonSep;
        if (isPosixPathSeparator(to.charCodeAt(toStart))) ++toStart;
        return to.slice(toStart);
    }
}
function toNamespacedPath1(path) {
    return path;
}
function dirname1(path) {
    if (path.length === 0) return ".";
    let end = -1;
    let matchedNonSeparator = false;
    for(let i = path.length - 1; i >= 1; --i){
        if (isPosixPathSeparator(path.charCodeAt(i))) {
            if (matchedNonSeparator) {
                end = i;
                break;
            }
        } else {
            matchedNonSeparator = true;
        }
    }
    if (end === -1) {
        return isPosixPathSeparator(path.charCodeAt(0)) ? "/" : ".";
    }
    return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator);
}
function basename1(path, suffix = "") {
    assertPath(path);
    if (path.length === 0) return path;
    if (typeof suffix !== "string") {
        throw new TypeError(`Suffix must be a string. Received ${JSON.stringify(suffix)}`);
    }
    const lastSegment = lastPathSegment(path, isPosixPathSeparator);
    const strippedSegment = stripTrailingSeparators(lastSegment, isPosixPathSeparator);
    return suffix ? stripSuffix(strippedSegment, suffix) : strippedSegment;
}
function extname1(path) {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for(let i = path.length - 1; i >= 0; --i){
        const code = path.charCodeAt(i);
        if (isPosixPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        return "";
    }
    return path.slice(startDot, end);
}
function format1(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
        throw new TypeError(`The "pathObject" argument must be of type Object. Received type ${typeof pathObject}`);
    }
    return _format("/", pathObject);
}
function parse1(path) {
    assertPath(path);
    const ret = {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: ""
    };
    if (path.length === 0) return ret;
    const isAbsolute = isPosixPathSeparator(path.charCodeAt(0));
    let start;
    if (isAbsolute) {
        ret.root = "/";
        start = 1;
    } else {
        start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for(; i >= start; --i){
        const code = path.charCodeAt(i);
        if (isPosixPathSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        if (end !== -1) {
            if (startPart === 0 && isAbsolute) {
                ret.base = ret.name = path.slice(1, end);
            } else {
                ret.base = ret.name = path.slice(startPart, end);
            }
        }
        ret.base = ret.base || "/";
    } else {
        if (startPart === 0 && isAbsolute) {
            ret.name = path.slice(1, startDot);
            ret.base = path.slice(1, end);
        } else {
            ret.name = path.slice(startPart, startDot);
            ret.base = path.slice(startPart, end);
        }
        ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0) {
        ret.dir = stripTrailingSeparators(path.slice(0, startPart - 1), isPosixPathSeparator);
    } else if (isAbsolute) ret.dir = "/";
    return ret;
}
function fromFileUrl1(url) {
    url = url instanceof URL ? url : new URL(url);
    if (url.protocol != "file:") {
        throw new TypeError("Must be a file URL.");
    }
    return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}
function toFileUrl1(path) {
    if (!isAbsolute1(path)) {
        throw new TypeError("Must be an absolute path.");
    }
    const url = new URL("file:///");
    url.pathname = encodeWhitespace(path.replace(/%/g, "%25").replace(/\\/g, "%5C"));
    return url;
}
const mod1 = {
    sep: sep1,
    delimiter: delimiter1,
    resolve: resolve1,
    normalize: normalize1,
    isAbsolute: isAbsolute1,
    join: join1,
    relative: relative1,
    toNamespacedPath: toNamespacedPath1,
    dirname: dirname1,
    basename: basename1,
    extname: extname1,
    format: format1,
    parse: parse1,
    fromFileUrl: fromFileUrl1,
    toFileUrl: toFileUrl1
};
const path = isWindows ? mod : mod1;
const { join: join2, normalize: normalize2 } = path;
const path1 = isWindows ? mod : mod1;
const { basename: basename2, delimiter: delimiter2, dirname: dirname2, extname: extname2, format: format2, fromFileUrl: fromFileUrl2, isAbsolute: isAbsolute2, join: join3, normalize: normalize3, parse: parse2, relative: relative2, resolve: resolve2, sep: sep2, toFileUrl: toFileUrl2, toNamespacedPath: toNamespacedPath2 } = path1;
const CHECKS1 = [
    checkRules
];
async function filenameValidate(schema, context) {
    for (const check of CHECKS1){
        await check(schema, context);
    }
    return Promise.resolve();
}
const ruleChecks = [
    extensionMismatch,
    keywordCheck
];
function checkRules(schema, context) {
    if (context.filenameRules.length === 1) {
        for (const check of ruleChecks){
            check(context.filenameRules[0], schema, context);
        }
    } else {
        const ogIssues = context.issues;
        const noIssues = [];
        const someIssues = [];
        for (const path of context.filenameRules){
            const tempIssues = new DatasetIssues();
            context.issues = tempIssues;
            for (const check of ruleChecks){
                check(path, schema, context);
            }
            tempIssues.size ? someIssues.push([
                path,
                tempIssues
            ]) : noIssues.push([
                path,
                tempIssues
            ]);
        }
        if (noIssues.length) {
            context.issues = ogIssues;
            context.filenameRules = [
                noIssues[0][0]
            ];
        } else if (someIssues.length) {
            context.issues = ogIssues;
            context.issues.addSchemaIssue('AllFilenameRulesHaveIssues', [
                {
                    ...context.file,
                    evidence: `Rules that matched with issues: ${someIssues.map((x)=>x[0]).join(', ')}`
                }
            ]);
        }
    }
    return Promise.resolve();
}
function extensionMismatch(path, schema, context) {
    const rule = schema[path];
    if (Array.isArray(rule.extensions) && !rule.extensions.includes(context.extension)) {
        context.issues.addSchemaIssue('ExtensionMismatch', [
            {
                ...context.file,
                evidence: `Rule: ${path}`
            }
        ]);
    }
}
function keywordCheck(path, schema, context) {
    const rule = schema[path];
    if ("usesKeywords" in rule && rule.usesKeywords) {
        if ('fileRegex' in rule) {
            const fileRegex = new RegExp(rule.fileRegex);
            const regexMatch = context.file.name.match(fileRegex);
            if (regexMatch && regexMatch[0] !== context.file.name || !regexMatch) {
                context.issues.addSchemaIssue("KeywordFormattingError", [
                    context.file
                ]);
            }
        }
        if (!Object.keys(context.keywords).every((keyword)=>keyword in schema['meta.context.context.properties.keywords.properties'])) {
            context.issues.addSchemaIssue("UnofficialKeywordWarning", [
                context.file
            ]);
        }
    }
}
function checkMissingRules(schema, rulesRecord, issues) {
    Object.keys(rulesRecord).filter((key)=>{
        return rulesRecord[key] === false;
    }).map((key)=>{
        const node = schema[key];
        issues.add({
            key: node.code,
            reason: node.reason,
            severity: node.level
        });
    });
}
var LogLevels;
(function(LogLevels) {
    LogLevels[LogLevels["NOTSET"] = 0] = "NOTSET";
    LogLevels[LogLevels["DEBUG"] = 10] = "DEBUG";
    LogLevels[LogLevels["INFO"] = 20] = "INFO";
    LogLevels[LogLevels["WARNING"] = 30] = "WARNING";
    LogLevels[LogLevels["ERROR"] = 40] = "ERROR";
    LogLevels[LogLevels["CRITICAL"] = 50] = "CRITICAL";
})(LogLevels || (LogLevels = {}));
Object.keys(LogLevels).filter((key)=>isNaN(Number(key)));
const byLevel = {
    [String(LogLevels.NOTSET)]: "NOTSET",
    [String(LogLevels.DEBUG)]: "DEBUG",
    [String(LogLevels.INFO)]: "INFO",
    [String(LogLevels.WARNING)]: "WARNING",
    [String(LogLevels.ERROR)]: "ERROR",
    [String(LogLevels.CRITICAL)]: "CRITICAL"
};
function getLevelByName(name) {
    switch(name){
        case "NOTSET":
            return LogLevels.NOTSET;
        case "DEBUG":
            return LogLevels.DEBUG;
        case "INFO":
            return LogLevels.INFO;
        case "WARNING":
            return LogLevels.WARNING;
        case "ERROR":
            return LogLevels.ERROR;
        case "CRITICAL":
            return LogLevels.CRITICAL;
        default:
            throw new Error(`no log level found for "${name}"`);
    }
}
function getLevelName(level) {
    const levelName = byLevel[level];
    if (levelName) {
        return levelName;
    }
    throw new Error(`no level name found for level: ${level}`);
}
class LogRecord {
    msg;
    #args;
    #datetime;
    level;
    levelName;
    loggerName;
    constructor(options){
        this.msg = options.msg;
        this.#args = [
            ...options.args
        ];
        this.level = options.level;
        this.loggerName = options.loggerName;
        this.#datetime = new Date();
        this.levelName = getLevelName(options.level);
    }
    get args() {
        return [
            ...this.#args
        ];
    }
    get datetime() {
        return new Date(this.#datetime.getTime());
    }
}
class Logger {
    #level;
    #handlers;
    #loggerName;
    constructor(loggerName, levelName, options = {}){
        this.#loggerName = loggerName;
        this.#level = getLevelByName(levelName);
        this.#handlers = options.handlers || [];
    }
    get level() {
        return this.#level;
    }
    set level(level) {
        this.#level = level;
    }
    get levelName() {
        return getLevelName(this.#level);
    }
    set levelName(levelName) {
        this.#level = getLevelByName(levelName);
    }
    get loggerName() {
        return this.#loggerName;
    }
    set handlers(hndls) {
        this.#handlers = hndls;
    }
    get handlers() {
        return this.#handlers;
    }
    #_log(level, msg, ...args) {
        if (this.level > level) {
            return msg instanceof Function ? undefined : msg;
        }
        let fnResult;
        let logMessage;
        if (msg instanceof Function) {
            fnResult = msg();
            logMessage = this.asString(fnResult);
        } else {
            logMessage = this.asString(msg);
        }
        const record = new LogRecord({
            msg: logMessage,
            args: args,
            level: level,
            loggerName: this.loggerName
        });
        this.#handlers.forEach((handler)=>{
            handler.handle(record);
        });
        return msg instanceof Function ? fnResult : msg;
    }
    asString(data) {
        if (typeof data === "string") {
            return data;
        } else if (data === null || typeof data === "number" || typeof data === "bigint" || typeof data === "boolean" || typeof data === "undefined" || typeof data === "symbol") {
            return String(data);
        } else if (data instanceof Error) {
            return data.stack;
        } else if (typeof data === "object") {
            return JSON.stringify(data);
        }
        return "undefined";
    }
    debug(msg, ...args) {
        return this.#_log(LogLevels.DEBUG, msg, ...args);
    }
    info(msg, ...args) {
        return this.#_log(LogLevels.INFO, msg, ...args);
    }
    warning(msg, ...args) {
        return this.#_log(LogLevels.WARNING, msg, ...args);
    }
    error(msg, ...args) {
        return this.#_log(LogLevels.ERROR, msg, ...args);
    }
    critical(msg, ...args) {
        return this.#_log(LogLevels.CRITICAL, msg, ...args);
    }
}
const { Deno: Deno1 } = globalThis;
const noColor = typeof Deno1?.noColor === "boolean" ? Deno1.noColor : true;
let enabled = !noColor;
function code(open, close) {
    return {
        open: `\x1b[${open.join(";")}m`,
        close: `\x1b[${close}m`,
        regexp: new RegExp(`\\x1b\\[${close}m`, "g")
    };
}
function run(str, code) {
    return enabled ? `${code.open}${str.replace(code.regexp, code.open)}${code.close}` : str;
}
function bold(str) {
    return run(str, code([
        1
    ], 22));
}
function red(str) {
    return run(str, code([
        31
    ], 39));
}
function yellow(str) {
    return run(str, code([
        33
    ], 39));
}
function blue(str) {
    return run(str, code([
        34
    ], 39));
}
new RegExp([
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))"
].join("|"), "g");
function copy(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    constructor(buf){
        this.buf = buf;
    }
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriterSync extends AbstractBufBase {
    #writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer, size = 4096){
        super(new Uint8Array(size <= 0 ? 4096 : size));
        this.#writer = writer;
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.#writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            const p = this.buf.subarray(0, this.usedBufferBytes);
            let nwritten = 0;
            while(nwritten < p.length){
                nwritten += this.#writer.writeSync(p.subarray(nwritten));
            }
        } catch (e) {
            if (e instanceof Error) {
                this.err = e;
            }
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.#writer.writeSync(data);
                } catch (e) {
                    if (e instanceof Error) {
                        this.err = e;
                    }
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
const DEFAULT_FORMATTER = "{levelName} {msg}";
class BaseHandler {
    level;
    levelName;
    formatter;
    constructor(levelName, options = {}){
        this.level = getLevelByName(levelName);
        this.levelName = levelName;
        this.formatter = options.formatter || DEFAULT_FORMATTER;
    }
    handle(logRecord) {
        if (this.level > logRecord.level) return;
        const msg = this.format(logRecord);
        return this.log(msg);
    }
    format(logRecord) {
        if (this.formatter instanceof Function) {
            return this.formatter(logRecord);
        }
        return this.formatter.replace(/{([^\s}]+)}/g, (match, p1)=>{
            const value = logRecord[p1];
            if (value == null) {
                return match;
            }
            return String(value);
        });
    }
    log(_msg) {}
    setup() {}
    destroy() {}
}
class ConsoleHandler extends BaseHandler {
    format(logRecord) {
        let msg = super.format(logRecord);
        switch(logRecord.level){
            case LogLevels.INFO:
                msg = blue(msg);
                break;
            case LogLevels.WARNING:
                msg = yellow(msg);
                break;
            case LogLevels.ERROR:
                msg = red(msg);
                break;
            case LogLevels.CRITICAL:
                msg = bold(red(msg));
                break;
            default:
                break;
        }
        return msg;
    }
    log(msg) {
        console.log(msg);
    }
}
class WriterHandler extends BaseHandler {
    _writer;
    #encoder = new TextEncoder();
}
class FileHandler extends WriterHandler {
    _file;
    _buf;
    _filename;
    _mode;
    _openOptions;
    _encoder = new TextEncoder();
    #unloadCallback = (()=>{
        this.destroy();
    }).bind(this);
    constructor(levelName, options){
        super(levelName, options);
        this._filename = options.filename;
        this._mode = options.mode ? options.mode : "a";
        this._openOptions = {
            createNew: this._mode === "x",
            create: this._mode !== "x",
            append: this._mode === "a",
            truncate: this._mode !== "a",
            write: true
        };
    }
    setup() {
        this._file = Deno.openSync(this._filename, this._openOptions);
        this._writer = this._file;
        this._buf = new BufWriterSync(this._file);
        addEventListener("unload", this.#unloadCallback);
    }
    handle(logRecord) {
        super.handle(logRecord);
        if (logRecord.level > LogLevels.ERROR) {
            this.flush();
        }
    }
    log(msg) {
        if (this._encoder.encode(msg).byteLength + 1 > this._buf.available()) {
            this.flush();
        }
        this._buf.writeSync(this._encoder.encode(msg + "\n"));
    }
    flush() {
        if (this._buf?.buffered() > 0) {
            this._buf.flush();
        }
    }
    destroy() {
        this.flush();
        this._file?.close();
        this._file = undefined;
        removeEventListener("unload", this.#unloadCallback);
    }
}
const DEFAULT_LEVEL = "INFO";
const DEFAULT_CONFIG = {
    handlers: {
        default: new ConsoleHandler(DEFAULT_LEVEL)
    },
    loggers: {
        default: {
            level: DEFAULT_LEVEL,
            handlers: [
                "default"
            ]
        }
    }
};
const state = {
    handlers: new Map(),
    loggers: new Map(),
    config: DEFAULT_CONFIG
};
function getLogger(name) {
    if (!name) {
        const d = state.loggers.get("default");
        assert(d != null, `"default" logger must be set for getting logger without name`);
        return d;
    }
    const result = state.loggers.get(name);
    if (!result) {
        const logger = new Logger(name, "NOTSET", {
            handlers: []
        });
        state.loggers.set(name, logger);
        return logger;
    }
    return result;
}
function setup(config) {
    state.config = {
        handlers: {
            ...DEFAULT_CONFIG.handlers,
            ...config.handlers
        },
        loggers: {
            ...DEFAULT_CONFIG.loggers,
            ...config.loggers
        }
    };
    state.handlers.forEach((handler)=>{
        handler.destroy();
    });
    state.handlers.clear();
    const handlers = state.config.handlers || {};
    for(const handlerName in handlers){
        const handler = handlers[handlerName];
        handler.setup();
        state.handlers.set(handlerName, handler);
    }
    state.loggers.clear();
    const loggers = state.config.loggers || {};
    for(const loggerName in loggers){
        const loggerConfig = loggers[loggerName];
        const handlerNames = loggerConfig.handlers || [];
        const handlers = [];
        handlerNames.forEach((handlerName)=>{
            const handler = state.handlers.get(handlerName);
            if (handler) {
                handlers.push(handler);
            }
        });
        const levelName = loggerConfig.level || DEFAULT_LEVEL;
        const logger = new Logger(loggerName, levelName, {
            handlers: handlers
        });
        state.loggers.set(loggerName, logger);
    }
}
setup(DEFAULT_CONFIG);
function parseStack(stack) {
    const lines = stack.split('\n');
    const caller = lines[2].trim();
    const token = caller.split('at ');
    return token[1];
}
const loggerProxyHandler = {
    get: function(_, prop) {
        const logger = getLogger('@psychds/validator');
        const stack = new Error().stack;
        if (stack) {
            const callerLocation = parseStack(stack);
            logger.debug(`Logger invoked at "${callerLocation}"`);
        }
        const logFunc = logger[prop];
        return logFunc.bind(logger);
    }
};
const logger = new Proxy(getLogger('@psychds/validator'), loggerProxyHandler);
const memoize = (fn)=>{
    const cache = new Map();
    const cached = function(val) {
        return cache.has(val) ? cache.get(val) : cache.set(val, fn.call(this, val)) && cache.get(val);
    };
    cached.cache = cache;
    return cached;
};
function applyRules(schema, context, rootSchema, schemaPath) {
    if (!rootSchema) {
        rootSchema = schema;
    }
    if (!schemaPath) {
        schemaPath = 'schema';
    }
    for(const key in schema){
        if (!(schema[key].constructor === Object)) {
            continue;
        }
        if ('selectors' in schema[key]) {
            evalRule(schema[key], context, rootSchema, `${schemaPath}.${key}`);
        } else if (schema[key].constructor === Object) {
            applyRules(schema[key], context, rootSchema, `${schemaPath}.${key}`);
        }
    }
    return Promise.resolve();
}
const evalConstructor = (src)=>new Function('context', `with (context) { return ${src} }`);
const safeHas = ()=>true;
const safeGet = (target, prop)=>prop === Symbol.unscopables ? undefined : target[prop];
const memoizedEvalConstructor = memoize(evalConstructor);
function evalCheck(src, context) {
    const test = memoizedEvalConstructor(src);
    const safeContext = new Proxy(context, {
        has: safeHas,
        get: safeGet
    });
    try {
        return test(safeContext);
    } catch (error) {
        logger.debug(error);
        return false;
    }
}
const evalMap = {
    columnsMatchMetadata: evalColumns,
    fields: evalJsonCheck
};
function evalRule(rule, context, schema, schemaPath) {
    if (rule.selectors && !mapEvalCheck(rule.selectors, context)) {
        return;
    }
    Object.keys(rule).filter((key)=>key in evalMap).map((key)=>{
        evalMap[key](rule, context, schema, schemaPath);
    });
}
function mapEvalCheck(statements, context) {
    return statements.every((x)=>evalCheck(x, context));
}
function evalColumns(_rule, context, schema, schemaPath) {
    if (context.extension !== '.csv') return;
    const headers = [
        ...Object.keys(context.columns)
    ];
    let invalidHeaders = [];
    for (const header of headers){
        if (!context.validColumns.includes(header)) {
            invalidHeaders = [
                ...invalidHeaders,
                header
            ];
        }
    }
    if (invalidHeaders.length != 0) {
        context.issues.addSchemaIssue('CsvColumnMissing', [
            {
                ...context.file,
                evidence: `Column headers: [${invalidHeaders}] do not appear in variableMeasured. ${schemaPath}`
            }
        ]);
    }
    const schemaOrgIssues = {
        'termIssues': [],
        'unknownNamespaceIssues': [],
        'typeIssues': [],
        'typeMissingIssues': []
    };
    schemaCheck(context, schema, schemaOrgIssues);
}
function evalJsonCheck(rule, context, _schema, schemaPath) {
    const issueKeys = [];
    for (const [key, requirement] of Object.entries(rule.fields)){
        const severity = getFieldSeverity(requirement, context);
        const keyName = `${rule.namespace}${key}`;
        if (severity && severity !== 'ignore' && !(keyName in context.sidecar)) {
            if (requirement.issue?.code && requirement.issue?.message) {
                context.issues.add({
                    key: requirement.issue.code,
                    reason: requirement.issue.message,
                    severity,
                    files: [
                        {
                            ...context.file
                        }
                    ]
                });
            } else {
                issueKeys.push(key);
            }
        }
    }
    if (issueKeys.length != 0) {
        context.issues.addSchemaIssue('JsonKeyRequired', [
            {
                ...context.file,
                evidence: `metadata object missing fields: [${issueKeys}] as per ${schemaPath}. 
                    If these fields appear to be present in your metadata, then there may be an issue with your schema.org context`
            }
        ]);
    }
}
function schemaCheck(context, schema, issues) {
    const schemaNamespace = 'http://schema.org/';
    if ("@type" in context.sidecar) {
        if (context.sidecar['@type'][0] !== `${schemaNamespace}Dataset`) {
            let issueFile;
            if (Object.keys(context.metadataProvenance).includes('@type')) issueFile = context.metadataProvenance['@type'];
            else issueFile = context.dataset.metadataFile;
            context.issues.addSchemaIssue('IncorrectDatasetType', [
                {
                    ...issueFile,
                    evidence: `dataset_description.json's "@type" property must have "Dataset" as its value.
                      additionally, the term "Dataset" must implicitly or explicitly use the schema.org namespace.
                      The schema.org namespace can be explicitly set using the "@context" key`
                }
            ]);
            return;
        }
    } else {
        context.issues.addSchemaIssue('MissingDatasetType', [
            {
                ...context.file,
                evidence: `dataset_description.json must have either the "@type" or the "type" property.`
            }
        ]);
        return;
    }
    issues = _schemaCheck(context.sidecar, context, schema, '', schemaNamespace, issues);
    logSchemaIssues(context, issues);
}
function logSchemaIssues(context, issues) {
    if (issues.termIssues.length != 0) {
        issues.termIssues.forEach((issue)=>{
            const rootKey = issue.split('.')[1];
            let issueFile;
            if (Object.keys(context.metadataProvenance).includes(rootKey)) issueFile = context.metadataProvenance[rootKey];
            else issueFile = context.dataset.metadataFile;
            context.issues.addSchemaIssue('InvalidSchemaorgProperty', [
                {
                    ...issueFile,
                    evidence: `This file contains one or more keys that use the schema.org namespace, but are not  official schema.org properties.
                      According to the psych-DS specification, this is not an error, but be advised that these terms will not be
                      machine-interpretable and do not function as linked data elements. These are the keys in question: [${issues.termIssues}]`
                }
            ]);
        });
    }
    if (issues.typeIssues.length != 0) {
        issues.typeIssues.forEach((issue)=>{
            const rootKey = issue.split('.')[1];
            let issueFile;
            if (rootKey in context.metadataProvenance) issueFile = context.metadataProvenance[rootKey];
            else issueFile = context.dataset.metadataFile;
            context.issues.addSchemaIssue('InvalidObjectType', [
                {
                    ...issueFile,
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
        issues.typeMissingIssues.forEach((issue)=>{
            const rootKey = issue.split('.')[1];
            let issueFile;
            if (Object.keys(context.metadataProvenance).includes(rootKey)) issueFile = context.metadataProvenance[rootKey];
            else issueFile = context.dataset.metadataFile;
            context.issues.addSchemaIssue('ObjectTypeMissing', [
                {
                    ...issueFile,
                    evidence: `This file contains one or more objects without a @type property. Make sure that any object that you include
                      as the value of a schema.org property contains a valid schema.org @type, unless it is functioning as some kind of 
                      base type, such as Text or URL, containing a @value key. @type is optional, but not required on such objects.
                      The following objects without @type were found: [${issues.typeMissingIssues}]`
                }
            ]);
        });
    }
    if (issues.unknownNamespaceIssues.length != 0) {
        issues.unknownNamespaceIssues.forEach((issue)=>{
            const rootKey = issue.split('.')[0];
            let issueFile;
            if (Object.keys(context.metadataProvenance).includes(rootKey)) issueFile = context.metadataProvenance[rootKey];
            else issueFile = context.dataset.metadataFile;
            context.issues.addSchemaIssue('UnknownNamespace', [
                {
                    ...issueFile,
                    evidence: `This file contains one or more references to namespaces other than https://schema.org:
                      [${issues.unknownNamespaceIssues}].`
                }
            ]);
        });
    }
}
function _schemaCheck(node, context, schema, objectPath, nameSpace, issues) {
    let superClassSlots = [];
    let thisType = '';
    if ('@type' in node) {
        thisType = node['@type'][0];
        superClassSlots = getSuperClassSlots(thisType, schema, nameSpace);
    }
    for (const [key, value] of Object.entries(node)){
        if (key.startsWith('@')) continue;
        else {
            if (!key.startsWith(nameSpace)) {
                issues.unknownNamespaceIssues.push(key);
                continue;
            } else {
                const property = key.replace(nameSpace, "");
                let range = [];
                if (property in schema[`schemaOrg.slots`]) {
                    if ('range' in schema[`schemaOrg.slots.${property}`]) {
                        range.push(schema[`schemaOrg.slots.${property}.range`]);
                        range = range.concat(getSubClassSlots(schema[`schemaOrg.slots.${property}.range`], schema, nameSpace));
                    }
                    if ('any_of' in schema[`schemaOrg.slots.${property}`]) {
                        for (const ran of schema[`schemaOrg.slots.${property}`].any_of){
                            if ('range' in ran) {
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
                    for(let i = 0; i < value.length; i++){
                        const obj = value[i];
                        subKeys = Object.keys(obj);
                        if (!(subKeys.length === 1 && (subKeys.includes("@id") || subKeys.includes("@value")))) {
                            if (subKeys.includes('@type')) {
                                const objType = Array.isArray(obj['@type']) ? obj['@type'][0].replace(nameSpace, '') : obj['@type'].replace(nameSpace, '');
                                if (![
                                    ...range,
                                    "Text",
                                    "URL"
                                ].includes(objType)) issues.typeIssues.push(`${objectPath}.${property}${i === 0 ? '' : `[${i}]`}`);
                                issues = _schemaCheck(obj, context, schema, `${objectPath}.${property}`, nameSpace, issues);
                            } else issues.typeMissingIssues.push(`${objectPath}.${property}${i === 0 ? '' : `[${i}]`}`);
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
        if ('is_a' in schema[`schemaOrg.classes.${type}`]) {
            if ('slots' in schema[`schemaOrg.classes.${type}`]) {
                return schema[`schemaOrg.classes.${type}.slots`].concat(getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`], schema, nameSpace));
            } else return getSuperClassSlots(schema[`schemaOrg.classes.${type}.is_a`], schema, nameSpace);
        } else return schema[`schemaOrg.classes.${type}.slots`];
    }
    return [];
}
function getSubClassSlots(type, schema, nameSpace) {
    const subClasses = [];
    if (type.includes(nameSpace)) {
        type = type.replace(nameSpace, "");
    }
    if (type in schema[`schemaOrg.classes`]) {
        for (const [key, value] of Object.entries(schema['schemaOrg.classes'])){
            if ("is_a" in value && value['is_a'] === type) {
                subClasses.push(key);
                subClasses.concat(getSubClassSlots(key, schema, nameSpace));
            }
        }
        return subClasses;
    } else return [];
}
function getFieldSeverity(requirement, context) {
    const levelToSeverity = {
        recommended: 'ignore',
        required: 'error',
        optional: 'ignore',
        prohibited: 'ignore'
    };
    let severity = 'ignore';
    if (typeof requirement === 'string' && requirement in levelToSeverity) {
        severity = levelToSeverity[requirement];
    } else if (typeof requirement === 'object' && requirement.level) {
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
class Summary {
    totalFiles;
    size;
    dataProcessed;
    dataTypes;
    schemaVersion;
    suggestedColumns;
    constructor(){
        this.dataProcessed = false;
        this.totalFiles = -1;
        this.size = 0;
        this.dataTypes = new Set();
        this.schemaVersion = '';
        this.suggestedColumns = [];
    }
    async update(context) {
        if (context.file.path.startsWith('/derivatives') && !this.dataProcessed) {
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
}
const hasProp = (obj, prop)=>{
    return Object.prototype.hasOwnProperty.call(obj, prop);
};
const objectPathHandler = {
    get (target, property) {
        let res = target;
        for (const prop of property.split('.')){
            if (hasProp(res, prop)) {
                res = res[prop];
            } else {
                return undefined;
            }
        }
        return res;
    }
};
async function loadSchema(version = 'latest') {
    const versionRegex = /\d+.\d+.\d+/;
    let schemaUrl = version;
    const psychdsSchema = typeof Deno !== 'undefined' ? Deno.env.get('psychDS_SCHEMA') : undefined;
    const schemaOrgUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/external_schemas/schemaorg/schemaorg.json?v=${Date.now()}`;
    if (psychdsSchema !== undefined) {
        schemaUrl = psychdsSchema;
    } else if (version === 'latest' || versionRegex.test(version)) {
        schemaUrl = `https://raw.githubusercontent.com/psych-ds/psych-DS/develop/schema_model/versions/jsons/${version}/schema.json?v=${Date.now()}`;
    }
    try {
        let schemaModule = await fetch(schemaUrl).then((response)=>response.text()).then((data)=>JSON.parse(data)).catch((error)=>{
            console.error('Error fetching JSON:', error);
        });
        schemaModule = {
            ...schemaModule
        };
        const schemaOrgModule = await fetch(schemaOrgUrl).then((response)=>response.text()).then((data)=>JSON.parse(data)).catch((error)=>{
            console.error('Error fetching JSON:', error);
        });
        schemaModule = {
            ...schemaModule,
            schemaOrg: schemaOrgModule
        };
        return new Proxy(schemaModule, objectPathHandler);
    } catch (error) {
        console.error(error);
        console.error(`Warning, could not load schema from ${schemaUrl}, falling back to internal version`);
        return new Proxy({}, objectPathHandler);
    }
}
class ColumnsMap extends Map {
    constructor(){
        super();
        const columns = new Map();
        return columns;
    }
}
function _readElements(filename) {
    let extension = '';
    let suffix = '';
    const keywords = {};
    const parts = filename.split('_');
    for(let i = 0; i < parts.length - 1; i++){
        const [key, value] = parts[i].split('-');
        keywords[key] = value || 'NOKEYWORD';
    }
    const lastPart = parts[parts.length - 1];
    const extStart = lastPart.indexOf('.');
    if (extStart === -1) {
        suffix = lastPart;
    } else {
        suffix = lastPart.slice(0, extStart);
        extension = lastPart.slice(extStart);
    }
    return {
        keywords,
        suffix,
        extension
    };
}
const readElements = memoize(_readElements);
class DenoStdInternalError1 extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert1(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError1(msg);
    }
}
class ParseError extends SyntaxError {
    startLine;
    line;
    column;
    constructor(start, line, column, message){
        super();
        this.startLine = start;
        this.column = column;
        this.line = line;
        if (message === ERR_FIELD_COUNT) {
            this.message = `record on line ${line}: ${message}`;
        } else if (start !== line) {
            this.message = `record on line ${start}; parse error on line ${line}, column ${column}: ${message}`;
        } else {
            this.message = `parse error on line ${line}, column ${column}: ${message}`;
        }
    }
}
const ERR_BARE_QUOTE = 'bare " in non-quoted-field';
const ERR_QUOTE = 'extraneous or missing " in quoted-field';
const ERR_INVALID_DELIM = "Invalid Delimiter";
const ERR_FIELD_COUNT = "wrong number of fields";
function convertRowToObject(row, headers, index) {
    if (row.length !== headers.length) {
        throw new Error(`Error number of fields line: ${index}\nNumber of fields found: ${headers.length}\nExpected number of fields: ${row.length}`);
    }
    const out = {};
    for(let i = 0; i < row.length; i++){
        out[headers[i]] = row[i];
    }
    return out;
}
const BYTE_ORDER_MARK = "\ufeff";
class Parser {
    #input = "";
    #cursor = 0;
    #options;
    constructor({ separator = ",", trimLeadingSpace = false, comment, lazyQuotes, fieldsPerRecord } = {}){
        this.#options = {
            separator,
            trimLeadingSpace,
            comment,
            lazyQuotes,
            fieldsPerRecord
        };
    }
    #readLine() {
        if (this.#isEOF()) return null;
        if (!this.#input.startsWith("\r\n", this.#cursor) || !this.#input.startsWith("\n", this.#cursor)) {
            let buffer = "";
            let hadNewline = false;
            while(this.#cursor < this.#input.length){
                if (this.#input.startsWith("\r\n", this.#cursor)) {
                    hadNewline = true;
                    this.#cursor += 2;
                    break;
                }
                if (this.#input.startsWith("\n", this.#cursor)) {
                    hadNewline = true;
                    this.#cursor += 1;
                    break;
                }
                buffer += this.#input[this.#cursor];
                this.#cursor += 1;
            }
            if (!hadNewline && buffer.endsWith("\r")) {
                buffer = buffer.slice(0, -1);
            }
            return buffer;
        }
        return null;
    }
    #isEOF() {
        return this.#cursor >= this.#input.length;
    }
    #parseRecord(startLine) {
        let line = this.#readLine();
        if (line === null) return null;
        if (line.length === 0) {
            return [];
        }
        function runeCount(s) {
            return Array.from(s).length;
        }
        let lineIndex = startLine + 1;
        if (this.#options.comment && line[0] === this.#options.comment) {
            return [];
        }
        assert1(this.#options.separator != null);
        let fullLine = line;
        let quoteError = null;
        const quote = '"';
        const quoteLen = quote.length;
        const separatorLen = this.#options.separator.length;
        let recordBuffer = "";
        const fieldIndexes = [];
        parseField: for(;;){
            if (this.#options.trimLeadingSpace) {
                line = line.trimStart();
            }
            if (line.length === 0 || !line.startsWith(quote)) {
                const i = line.indexOf(this.#options.separator);
                let field = line;
                if (i >= 0) {
                    field = field.substring(0, i);
                }
                if (!this.#options.lazyQuotes) {
                    const j = field.indexOf(quote);
                    if (j >= 0) {
                        const col = runeCount(fullLine.slice(0, fullLine.length - line.slice(j).length));
                        quoteError = new ParseError(startLine + 1, lineIndex, col, ERR_BARE_QUOTE);
                        break parseField;
                    }
                }
                recordBuffer += field;
                fieldIndexes.push(recordBuffer.length);
                if (i >= 0) {
                    line = line.substring(i + separatorLen);
                    continue parseField;
                }
                break parseField;
            } else {
                line = line.substring(quoteLen);
                for(;;){
                    const i = line.indexOf(quote);
                    if (i >= 0) {
                        recordBuffer += line.substring(0, i);
                        line = line.substring(i + quoteLen);
                        if (line.startsWith(quote)) {
                            recordBuffer += quote;
                            line = line.substring(quoteLen);
                        } else if (line.startsWith(this.#options.separator)) {
                            line = line.substring(separatorLen);
                            fieldIndexes.push(recordBuffer.length);
                            continue parseField;
                        } else if (0 === line.length) {
                            fieldIndexes.push(recordBuffer.length);
                            break parseField;
                        } else if (this.#options.lazyQuotes) {
                            recordBuffer += quote;
                        } else {
                            const col = runeCount(fullLine.slice(0, fullLine.length - line.length - quoteLen));
                            quoteError = new ParseError(startLine + 1, lineIndex, col, ERR_QUOTE);
                            break parseField;
                        }
                    } else if (line.length > 0 || !this.#isEOF()) {
                        recordBuffer += line;
                        const r = this.#readLine();
                        lineIndex++;
                        line = r ?? "";
                        fullLine = line;
                        if (r === null) {
                            if (!this.#options.lazyQuotes) {
                                const col = runeCount(fullLine);
                                quoteError = new ParseError(startLine + 1, lineIndex, col, ERR_QUOTE);
                                break parseField;
                            }
                            fieldIndexes.push(recordBuffer.length);
                            break parseField;
                        }
                        recordBuffer += "\n";
                    } else {
                        if (!this.#options.lazyQuotes) {
                            const col = runeCount(fullLine);
                            quoteError = new ParseError(startLine + 1, lineIndex, col, ERR_QUOTE);
                            break parseField;
                        }
                        fieldIndexes.push(recordBuffer.length);
                        break parseField;
                    }
                }
            }
        }
        if (quoteError) {
            throw quoteError;
        }
        const result = [];
        let preIdx = 0;
        for (const i of fieldIndexes){
            result.push(recordBuffer.slice(preIdx, i));
            preIdx = i;
        }
        return result;
    }
    parse(input) {
        this.#input = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
        this.#cursor = 0;
        const result = [];
        let _nbFields;
        let lineResult;
        let first = true;
        let lineIndex = 0;
        const INVALID_RUNE = [
            "\r",
            "\n",
            '"'
        ];
        const options = this.#options;
        if (INVALID_RUNE.includes(options.separator) || typeof options.comment === "string" && INVALID_RUNE.includes(options.comment) || options.separator === options.comment) {
            throw new Error(ERR_INVALID_DELIM);
        }
        for(;;){
            const r = this.#parseRecord(lineIndex);
            if (r === null) break;
            lineResult = r;
            lineIndex++;
            if (first) {
                first = false;
                if (options.fieldsPerRecord !== undefined) {
                    if (options.fieldsPerRecord === 0) {
                        _nbFields = lineResult.length;
                    } else {
                        _nbFields = options.fieldsPerRecord;
                    }
                }
            }
            if (lineResult.length > 0) {
                if (_nbFields && _nbFields !== lineResult.length) {
                    throw new ParseError(lineIndex, lineIndex, null, ERR_FIELD_COUNT);
                }
                result.push(lineResult);
            }
        }
        return result;
    }
}
function parse3(input, opt = {
    skipFirstRow: false
}) {
    const parser = new Parser(opt);
    const r = parser.parse(input);
    if (opt.skipFirstRow || opt.columns) {
        let headers = [];
        if (opt.skipFirstRow) {
            const head = r.shift();
            assert1(head != null);
            headers = head;
        }
        if (opt.columns) {
            headers = opt.columns;
        }
        const firstLineIndex = opt.skipFirstRow ? 1 : 0;
        return r.map((row, i)=>{
            return convertRowToObject(row, headers, firstLineIndex + i);
        });
    }
    return r;
}
const normalizeEOL = (str)=>str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
function parseCSV(contents) {
    const columns = new ColumnsMap();
    const issues = [];
    const normalizedStr = normalizeEOL(contents);
    try {
        const rows = parse3(normalizedStr);
        const headers = rows.length ? rows[0] : [];
        if (headers.length === 0) issues.push({
            'issue': 'NoHeader',
            'message': null
        });
        else {
            if (!rows.slice(1).every((row)=>row.length === headers.length)) issues.push({
                'issue': 'HeaderRowMismatch',
                'message': null
            });
        }
        headers.map((x)=>{
            columns[x] = [];
        });
        for(let i = 1; i < rows.length; i++){
            for(let j = 0; j < headers.length; j++){
                const col = columns[headers[j]];
                col.push(rows[i][j]);
            }
        }
        if (Object.keys(columns).includes("row_id") && [
            ...new Set(columns["row_id"])
        ].length !== columns["row_id"].length) issues.push({
            'issue': 'RowidValuesNotUnique',
            'message': null
        });
    } catch (error) {
        issues.push({
            'issue': 'CSVFormattingError',
            'message': error.message
        });
    }
    const response = {
        'columns': columns,
        'issues': issues
    };
    return response;
}
class psychDSContextDataset {
    dataset_description;
    metadataFile;
    options;
    files;
    baseDirs;
    tree;
    ignored;
    constructor(options, metadataFile, description = {}){
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
}
const defaultDsContext = new psychDSContextDataset();
class psychDSContext {
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
    constructor(fileTree, file, issues, dsContext){
        this.fileTree = fileTree;
        this.filenameRules = [];
        this.issues = issues;
        this.file = file;
        this.fileName = file.name.split('.')[0];
        this.baseDir = file.path.split('/').length > 2 ? file.path.split('/')[1] : '/';
        const elements = readElements(file.name);
        this.keywords = elements.keywords;
        this.extension = elements.extension;
        this.suffix = elements.suffix;
        this.dataset = dsContext ? dsContext : defaultDsContext;
        this.datatype = '';
        this.sidecar = dsContext ? dsContext.dataset_description : {};
        this.expandedSidecar = {};
        this.validColumns = [];
        this.metadataProvenance = {};
        this.columns = new ColumnsMap();
        this.suggestedColumns = [];
    }
    get json() {
        return JSON.parse(this.file.fileText);
    }
    get path() {
        return this.file.path;
    }
    get datasetPath() {
        return this.fileTree.path;
    }
    async loadSidecar(fileTree) {
        if (!fileTree) {
            fileTree = this.fileTree;
        }
        const validSidecars = fileTree.files.filter((file)=>{
            const { suffix, extension } = readElements(file.name);
            return extension === '.json' && suffix === "data" && file.name.split('.')[0] === this.fileName || extension === '.json' && file.name.split('.')[0] == "file_metadata";
        });
        if (validSidecars.length > 1) {
            const exactMatch = validSidecars.find((sidecar)=>sidecar.path == this.file.path.replace(this.extension, '.json'));
            if (exactMatch) {
                validSidecars.splice(1);
                validSidecars[0] = exactMatch;
            } else {
                logger.warning(`Multiple sidecar files detected for '${this.file.path}'`);
            }
        }
        if (validSidecars.length === 1) {
            this.sidecar = {
                ...this.sidecar,
                ...validSidecars[0].expanded
            };
            Object.keys(validSidecars[0].expanded).forEach((key)=>{
                const baseKey = key.split('/').at(-1);
                this.metadataProvenance[baseKey] = validSidecars[0];
            });
        }
        const nextDir = fileTree.directories.find((directory)=>{
            return this.file.path.startsWith(directory.path);
        });
        if (nextDir) {
            await this.loadSidecar(nextDir);
        } else {
            this.expandedSidecar = {};
            this.loadValidColumns();
        }
    }
    loadValidColumns() {
        if (this.extension !== '.csv') {
            return;
        }
        const nameSpace = "http://schema.org/";
        if (!(`${nameSpace}variableMeasured` in this.sidecar)) {
            return;
        }
        let validColumns = [];
        for (const variable of this.sidecar[`${nameSpace}variableMeasured`]){
            if ('@value' in variable) validColumns = [
                ...validColumns,
                variable['@value']
            ];
            else {
                if (`${nameSpace}name` in variable) {
                    const subVar = variable[`${nameSpace}name`][0];
                    if ('@value' in subVar) validColumns = [
                        ...validColumns,
                        subVar['@value']
                    ];
                }
            }
        }
        this.validColumns = validColumns;
    }
    async loadColumns() {
        if (this.extension !== '.csv') {
            return;
        }
        let result;
        try {
            result = await parseCSV(this.file.fileText);
        } catch (error) {
            logger.warning(`csv file could not be opened by loadColumns '${this.file.path}'`);
            logger.debug(error);
            result = new Map();
        }
        this.columns = result['columns'];
        this.reportCSVIssues(result['issues']);
        return;
    }
    reportCSVIssues(issues) {
        issues.forEach((issue)=>{
            if (issue.message) {
                this.issues.addSchemaIssue(issue.issue, [
                    {
                        ...this.file,
                        evidence: issue.message
                    }
                ]);
            } else {
                this.issues.addSchemaIssue(issue.issue, [
                    this.file
                ]);
            }
        });
    }
    async asyncLoads() {
        await Promise.allSettled([
            this.loadSidecar(),
            this.loadColumns()
        ]);
    }
}
async function* _walkFileTree(fileTree, root, issues, dsContext) {
    for (const file of fileTree.files){
        yield new psychDSContext(root, file, issues, dsContext);
    }
    for (const dir of fileTree.directories){
        if (fileTree.path === "/" && dsContext) {
            dsContext.baseDirs = [
                ...dsContext.baseDirs,
                `/${dir.name}`
            ];
        }
        yield* _walkFileTree(dir, root, issues, dsContext);
    }
}
async function* walkFileTree(fileTree, issues, dsContext) {
    yield* _walkFileTree(fileTree, fileTree, issues, dsContext);
}
const CHECKS2 = [
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
    const ddFile = fileTree.files.find((file)=>file.name === 'dataset_description.json');
    let dsContext;
    if (ddFile) {
        try {
            const description = ddFile.expanded;
            dsContext = new psychDSContextDataset(options, ddFile, description);
        } catch (_error) {
            dsContext = new psychDSContextDataset(options, ddFile);
            issues.addSchemaIssue('InvalidJsonFormatting', [
                ddFile
            ]);
        }
    } else {
        dsContext = new psychDSContextDataset(options);
    }
    const rulesRecord = {};
    findFileRules(schema, rulesRecord);
    for await (const context of walkFileTree(fileTree, issues, dsContext)){
        if (context.file.issueInfo.length > 0) {
            context.file.issueInfo.forEach((iss)=>{
                issues.addSchemaIssue(iss.key, [
                    {
                        ...context.file,
                        evidence: iss.evidence ? iss.evidence : ''
                    }
                ]);
            });
        }
        if (context.file.ignored) {
            continue;
        }
        await context.asyncLoads();
        if (context.extension === ".csv") {
            summary.suggestedColumns = [
                ...new Set([
                    ...summary.suggestedColumns,
                    ...Object.keys(context.columns)
                ])
            ];
        }
        for (const check of CHECKS2){
            await check(schema, context);
        }
        for (const rule of context.filenameRules){
            rulesRecord[rule] = true;
        }
        await summary.update(context);
    }
    checkDirRules(schema, rulesRecord, dsContext.baseDirs);
    checkMissingRules(schema, rulesRecord, issues);
    issues.filterIssues(rulesRecord);
    const output = {
        valid: [
            ...issues.values()
        ].filter((issue)=>issue.severity === "error").length === 0,
        issues,
        summary: summary.formatOutput()
    };
    return output;
}
export { validate as validate };
