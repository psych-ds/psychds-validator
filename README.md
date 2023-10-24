# The psych-DS Validator CLI 

This repository contains the source code for the psych-DS validator tool, which is currently in development. 

## Quickstart

To begin, open your terminal and clone this repository:

`git clone https://github.com/psych-ds/psychds-validator.git`

The psych-DS validator is built using Deno, a Javascript and Typescript runtime. It is the only tool that you will need to install, and it's very simple to do so.

### Mac/Linux
Open the terminal and input this command:

`curl -fsSL https://deno.land/x/install/install.sh | sh`

### PC
Open powershell (cmd.exe) and input this command:

`irm https://deno.land/install.ps1 | iex`

## Usage
To run the CLI validator, navigate to the psychds-validator directory and input this command:

`deno run --allow-net --allow-read --allow-env src/psychds-validator.ts <input_dataset_to_validate>`

By default, the validator only outputs errors that it finds in the dataset. To show warnings as well, add the --showWarnings tag to the end of the command.

## Basis of the Code
The core infrastructure is derived explicitly from the [BIDS Deno-based CLI validator](https://github.com/bids-standard/bids-validator/tree/master/bids-validator/src). There are many elements of the application whose core elements and functions remain untouched from the BIDS validator, including but not limited to schema imports, context generation, file crawling, interface definitions, I/O formatting, and issue generation. My reasoning for not building this app explicitly as a fork or a proposed module on the BIDS app comes down to a combination of how little of the BIDS app's considerable functionality is actually required for our purposes and how many small but consequential adjustments have gone into adapting it to our purposes. For instance, it seems that BIDS only attends to the validity of the files it finds, whereas psych-DS has rules that govern which files and directories must be included, in addition to specifying their contents/formatting. The main component left to build in this version is a json-LD validator, which could have value for the BIDS team as a module to be integrated into their app.
