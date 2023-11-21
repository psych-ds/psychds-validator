# The psych-DS Validator CLI 

This repository contains the source code for the psych-DS validator tool, which is currently in development. 

This version of the validator requires using your terminal to enter text commands on your computer. Please visit https://github.com/psych-DS/psych-DS/ for more information on the Psych-DS project!

## Quickstart

To begin, open your terminal and clone this repository:

`git clone https://github.com/psych-ds/psychds-validator.git`

The psych-DS validator is built using Deno, a runtime environment for Javascript and Typescript. 

You will need to install Deno, but your computer should already have all of the other software tools needed to install and use the Psych-DS validator. (Tested on Macs only as of 10-2023.)


### Mac/Linux Installation Instructions

Open the terminal and input this command:

`curl -fsSL https://deno.land/x/install/install.sh | sh`

After installing, deno will output some instructions about how to add deno to your PATH variable (so that you can use it without writing out the entire path to the app). It will look like this:

```
export DENO_INSTALL="/Users/<your_username>/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
```

 If you're unsure how to handle this, you can use these commands to add the lines to the .zshrc file and then source the file so the changes are reloaded:
 (make sure to modify the command by replacing <your_username> with your actual mac username)

```
echo -e '\nexport DENO_INSTALL="/Users/<your_username>/.deno"\nexport PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

You can test to see if the commands have worked by typing `deno --version` and confirming that deno returns a series of version numbers instead of something like 'deno could not be found'.

### PC Installation Instructions

Open powershell (cmd.exe) and input this command:

`irm https://deno.land/install.ps1 | iex`

(PC instructions to be added)



## Usage
To run the CLI validator, navigate to the psychds-validator directory and input this command:

`deno run --allow-net --allow-read --allow-env src/psychds-validator.ts <input_dataset_to_validate>`

By default, the validator only outputs errors that it finds in the dataset. To show warnings as well, add the `--showWarnings` tag to the end of the command.

## Testing
To run the testing suite for the application, navigate to the base directory and run the command:

`deno test --allow-net --allow-read --allow-env`

## Basis of the Code
The core infrastructure is derived explicitly from the [BIDS Deno-based CLI validator](https://github.com/bids-standard/bids-validator/tree/master/bids-validator/src).

There are many elements of this application whose core elements and functions remain untouched from the BIDS validator, including but not limited to schema imports, context generation, file crawling, interface definitions, I/O formatting, and issue generation. 

My reasoning for not building this app explicitly as a fork or a proposed module on the BIDS app comes down to a combination of how little of the BIDS app's considerable functionality is actually required for our purposes and how many small but consequential adjustments have gone into adapting it to our purposes. For instance, it seems that BIDS only attends to the validity of the files it finds, whereas psych-DS has rules that govern which files and directories must be included, in addition to specifying their contents/formatting. 

The main component left to build in this version is a json-LD validator, which could have value for the BIDS team as a module to be integrated into their app.
