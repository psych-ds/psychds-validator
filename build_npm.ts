import { build, emptyDir } from "@deno/dnt";
import { copy } from "https://deno.land/std/fs/mod.ts";

// Clear the npm directory to ensure a clean build
// Confirm that these directories exist so copying files works
await emptyDir("./npm");
await emptyDir("./npm/esm/src/setup/");
await emptyDir("./npm/script/src/setup/");

try {
    // Copy necessary files for both ESM and CommonJS builds
    // This ensures that test data and test files are available in the npm package
    await copy("test_data", "npm/esm/test_data", { overwrite: true });
    await copy("test_data", "npm/script/test_data", { overwrite: true });
    await copy("src/tests", "npm/esm/src/tests", { overwrite: true });
    await copy("src/tests", "npm/script/src/tests", { overwrite: true });

    // Copy default schema files
    // These files are necessary for the validator to function without network access
    await Deno.copyFile("src/setup/defaultSchema.json", "npm/esm/src/setup/defaultSchema.json");
    await Deno.copyFile("src/setup/defaultSchemaOrg.json", "npm/esm/src/setup/defaultSchemaOrg.json");
    await Deno.copyFile("src/setup/defaultSchema.json", "npm/script/src/setup/defaultSchema.json");
    await Deno.copyFile("src/setup/defaultSchemaOrg.json", "npm/script/src/setup/defaultSchemaOrg.json");

    // Create CLI entry point
    // This file allows the package to be used as a command-line tool
    const cliContent = `#!/usr/bin/env node
    const { run } = require('./script/src/index.js');

    run(process.argv.slice(2)).catch((error) => {
        console.error('An error occurred:', error);
        process.exit(1);
    });
    `;

    await Deno.writeTextFile("npm/cli.js", cliContent);

    // Log the contents of the npm directory for debugging purposes
    console.log("Contents of npm directory:");
    for await (const dirEntry of Deno.readDir("npm")) {
        console.log(dirEntry.name);
    }

    // Build configuration for dnt (Deno to Node Transform)
    await build({
        entryPoints: ["./src/index.ts"],
        outDir: "./npm",
        shims: {
            // Provide Deno-specific APIs in Node.js environment
            deno: true,
            jsonld: "npm:jsonld",
            // Custom shim for ReadableStream
            custom: [
                {
                    module: "./shims.ts",
                    globalNames: ["ReadableStream"]
                },
            ],
        },
        compilerOptions: {
            target: "ES2022",
            lib: ["DOM", "ES2022"],
            moduleResolution: "node",
        },
        rootTestDir: "./src",
        typeCheck: "both",
        test: true,
        package: {
            // npm package configuration
            name: "psychds-validator",
            author: {
                name: "Brian Leonard",
                email: "bleonard@mit.edu",
                url: "https://orcid.org/0009-0005-7244-6882"
            },
            repository: {
                type: "git",
                url: "git+https://github.com/psych-ds/psychds-validator.git"
            },
            version: Deno.args[0],
            description: "This is the node implementation of the Psych-DS validator, originally implemented within the Deno framework. Psych-DS is a lightweight data standard for data collected in the behavioral sciences. This tool can be used to test the validity of datasets (in the form of file systems) with respect to the Psych-DS schema.",
            license: "MIT",
            repository: {
                type: "git",
                url: "git+https://github.com/psych-ds/psychds-validator.git",
            },
            bugs: {
                url: "https://github.com/psych-ds/psychds-validator/issues",
            },
            // External dependencies required by the package
            dependencies: {
                "jsonld": "8.3.2",
                "node-fetch": "^3.3.0",
                "undici": "5.28.4",
                "winston": "^3.8.2",
                "commander": "^9.4.0",
                "chalk": "^4.1.2",
                "cli-table3": "^0.6.3"
            },
            // Entry points for different module systems
            main: "./script/src/index.js",
            module: "./esm/src/index.js",
            exports: {
                ".": {
                    "import": "./esm/src/index.js",
                    "require": "./script/src/index.js"
                }
            },
            // CLI configuration
            bin: {
                validate: "./cli.js"
            },
        },
        packageManager: "npm",
        importMap: "deno.json",
    }); 

} catch (error) {
    console.error("Build failed with error:", error);
    if (error.stack) {
        console.error("Stack trace:", error.stack);
    }
    Deno.exit(1)
}