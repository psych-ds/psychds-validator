import { build, emptyDir } from "@deno/dnt";
import { copy } from "https://deno.land/std/fs/mod.ts";
import fs from "node:fs"

import * as esbuild from "https://deno.land/x/esbuild@v0.17.11/mod.js";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.9";

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
            version: Deno.args[0],
            description: "psychds-validator",
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
                "cli-table3": "^0.6.3",
                "eventemitter3": "^5.0.0"
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

    const _result = await esbuild.build({
    entryPoints: ["./src/validate-web.ts"],
    bundle: true,
    outfile: "./npm/web/psychds-validator.js",
    format: "esm",
    target: "es2020",
    sourcemap: true,
    minify: false,
    platform: 'browser',
    treeShaking: true,
    define: {
      "Deno.env.get": "undefined",
      "import.meta.main": "undefined",
      "global": "window",
    },
    external: [
      "chalk",
      "cli-table3",
      "commander",
      "winston",
      "node-fetch",
      "undici",
      "jsonld",
      "rdf-canonize-native"
    ],
    plugins: [
        ...denoPlugins(),
      {
        name: 'node-modules-resolver',
        setup(build) {
          // Handle Node.js built-ins
          build.onResolve({ filter: /^node:/ }, args => {
            return { path: args.path, external: true };
          });
        },
      },
      {
        name: 'expose-validate-web',
        setup(build) {
          build.onEnd(() => {
            const outfile = "./npm/web/psychds-validator.js";
            let content = fs.readFileSync(outfile, 'utf8');
            if (!content.includes('window.psychDSValidator')) {
              content += '\nif (typeof window !== "undefined") { window.psychDSValidator = { validateWeb }; }';
              fs.writeFileSync(outfile, content);
            }
          });
        }
      }
    ],
  });

    


} catch (error) {
    console.error("Build failed with error:", error);
    if (error.stack) {
        console.error("Stack trace:", error.stack);
    }
    Deno.exit(1)
} finally {
    esbuild.stop()
}