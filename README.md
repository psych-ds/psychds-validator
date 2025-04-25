# The Psych-DS Validator

This repository contains the source code for the Psych-DS Validator tool. 

The validator was developed using the Deno framework and can be run as a Deno app, but it also available via npm as a node package (ESM/CJS compatible) to be used either as a CLI tool or an imported javascript function. There is a bundled version as well that can be imported for browser contexts. All versions of the validator app are generated from the Deno-based source code, and they all leverage the [YAML-based Psych-DS schema model](https://github.com/psych-DS/psych-DS/) for information on rules and error messages, etc.

There is a [browser-based version of the validator](https://psych-ds.github.io/validator/) available for anyone to use. It uses the same code as the CLI tool and produces identical validation results.

Please visit [The Psych-DS Docs](https://psychds-docs.readthedocs.io/en/latest/) or [Our core repository](https://github.com/psych-DS/psych-DS/) for more information on the Psych-DS project!

## Installation

### Using npm

Install the psychds-validator package:

`npm install -g psychds-validator`

Use the "validate" command to run the validator on your datasets (with any of the optional flags as described below):

`validate <path_to_input_directory>`

The validate function can be imported within other node apps as well:

For CJS contexts:
`const { validate } = require("psychds-validator");`

For ESM contexts:
`import { validate } from "psychds-validator";`

Then the validate function can be used with any of the optional flags:
`const result = await validate("<path_to_example_dataset>",{'exampleOption':true});`

### Without npm:

If you would prefer to run the validator directly as a Deno app, you can [install deno](https://docs.deno.com/runtime/getting_started/installation/), clone this repository, and run the following command from the root of the repository:
`deno run -A src/index.ts <path_to_dataset> <optional_flags>`

## Usage
The validator app can be run with the following optional parameters:

- `-w` or `--showWarnings`: causes the validator to output warnings and suggestions for best practices in addition to any errors.
- `--useEvents`: switches the validator to display the output as a sequential progress checklist instead of a collection of issues. Only reports the first error it encounters in the sequence
- `--json`: causes the validator to return the validation results as a JSON rather than printing them to the log.
- `-s` or `--schema`: switches the validator to use a different version of the Psych-DS schema. Default is "latest".

## Basis of the Code
The core infrastructure is derived explicitly from the [BIDS Deno-based CLI validator](https://github.com/bids-standard/bids-validator/tree/master/bids-validator/src).
