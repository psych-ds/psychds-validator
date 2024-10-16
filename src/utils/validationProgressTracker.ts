import { EventEmitter } from './platform.ts';
import { ValidationResult } from '../types/validation-result.ts';
import { logger } from './logger.ts';
import { formatIssue } from './output.ts';
import { Issue } from '../types/issues.ts';

/**
 * Represents a message for a step, containing both imperative and past tense forms.
 */
type StepMessage = {
  imperative: string;
  pastTense: string;
};

/**
 * Represents a substep in the validation process.
 */
type SubStep = {
  key: string;
  message: StepMessage;
};

/**
 * Represents a main step in the validation process, which may contain substeps.
 */
type SuperStep = {
  key: string;
  message: StepMessage;
  subSteps: SubStep[];
};

/**
 * Represents the status of a step in the validation process.
 */
type StepStatus = {
  complete: boolean;
  success: boolean;
  issue?: Issue;
};

/**
 * Tracks and displays the progress of the validation process.
 */
export class ValidationProgressTracker {
    private emitter: typeof EventEmitter;
    private steps: SuperStep[];
    private stepStatus: Map<string, StepStatus>;
    private result: ValidationResult | null;
    private lastUpdateTime: number;
    private logger: Awaited<typeof logger> | null;
  
    /**
     * Creates a new ValidationProgressTracker.
     * @param emitter - The EventEmitter to listen for validation events.
     */
    constructor(emitter: typeof EventEmitter) {
      this.emitter = emitter;
      this.steps = [
        {
          key: 'start',
          message: { imperative: 'Start validation', pastTense: 'Validation started' },
          subSteps: []
        },
        {
          key: 'check-folder',
          message: { imperative: 'Find project folder', pastTense: 'Project folder found' },
          subSteps: [
            { key: 'build-tree', message: { imperative: 'Crawl project folder and construct file tree', pastTense: 'Project folder crawled and file tree constructed' } },
          ]
        },
        {
            key: 'find-metadata',
            message: { imperative: 'Find metadata file', pastTense: 'Metadata file "dataset_description.json" found in the root folder' },
            subSteps: []
          },
        {
            key: 'find-data-dir',
            message: { imperative: `Find "data" subfolder`, pastTense: `"data" subfolder found in the root folder` },
            subSteps: []
          },
        {
            key: 'parse-metadata',
            message: { imperative: 'Parse "dataset_description.json" metadata file', pastTense: 'Successfully parsed "dataset_description.json" metadata file' },
            subSteps: [
                { key: 'metadata-utf8', message: { imperative: 'Check metadata file for utf-8 encoding', pastTense: 'Metadata file is utf-8 encoded' } },
                { key: 'metadata-json', message: { imperative: 'Parse metadata file as JSON', pastTense: 'Metadata file parsed successfully' } },
                { key: 'metadata-jsonld', message: { imperative: 'Validate metadata file as JSON-LD', pastTense: 'Metadata file is valid JSON-LD' } },
                { key: 'metadata-fields', message: { imperative: `Check metadata file for required "name", "description", and "variableMeasured" fields`, pastTense: `Metadata file contains required "name", "description", and "variableMeasured" fields.` } },
                
                { key: 'metadata-type', message: { imperative: 'Check metadata file for field "@type" with value "Dataset"', pastTense: 'Metadata file has "@type" field with value "Dataset"' } },
            ]
          },
        {
            key: 'check-for-csv',
            message: { imperative: `Check for CSV data files in "data" subfolder`, pastTense: `CSV data files found in "data" subfolder` },
            subSteps: []
          },
        {
            key: 'validate-csvs',
            message: { imperative: `Check that all CSV data files are valid`, pastTense: `All CSV data files are valid` },
            subSteps: [
                { key: 'csv-keywords', message: { imperative: `Check filename for keyword formatting `, pastTense: `Filename uses valid keyword formatting` } },
                { key: 'csv-parse', message: { imperative: `Parse data file as CSV`, pastTense: `Data file successfully parsed as CSV` } },
                { key: 'csv-header', message: { imperative: `Check for header line`, pastTense: `Header line found` } },
                { key: 'csv-nomismatch', message: { imperative: `Check all lines for equal number of cells`, pastTense: `All lines have equal number of cells` } },
                { key: 'csv-rowid', message: { imperative: `Check for any row_id columns with non-unique values`, pastTense: `All row_id columns have unique values` } },
            ]
          },
        {
            key: 'check-variableMeasured',
            message: { imperative: `Confirm that all column headers in CSV data files are found in "variableMeasured" metadata field`, pastTense: `All column headers in CSV data files were found in "variableMeasured" metadata field` },
            subSteps: []
          },
      ];
      
      this.stepStatus = new Map();
      this.initializeStepStatus();
      
      this.result = null;
      this.lastUpdateTime = 0;
      this.logger = null;
  
      this.setupListeners();
      this.initLogger();
    }


    private async initLogger() {
      this.logger = await logger;
      this.displayChecklist();
    }
  
    /**
     * Initializes the status for all steps and substeps.
     */
    private initializeStepStatus() {
      this.steps.forEach(superStep => {
        this.stepStatus.set(superStep.key, { complete: false, success: false });
        superStep.subSteps.forEach(subStep => {
          this.stepStatus.set(subStep.key, { complete: false, success: false });
        });
      });
    }
  
    /**
     * Sets up listeners for all steps and substeps.
     */
    private setupListeners() {
      this.steps.forEach((superStep) => {
        if (superStep.subSteps.length === 0) {
          this.emitter.once(superStep.key, (data: { success: boolean, issue?: Issue }) => {
            this.updateStepStatus(superStep.key, data, superStep);
          });
        } else {
          superStep.subSteps.forEach(subStep => {
            this.emitter.once(subStep.key, (data: { success: boolean, issue?: Issue }) => {
              this.updateStepStatus(subStep.key, data, superStep);
            });
          });
        }
      });
    }
  
    /**
     * Updates the status of a step or substep.
     * @param stepKey - The key of the step to update.
     * @param superStepIndex - The index of the parent step.
     * @param data - The status data for the step.
     * @param superStep - The parent step (if updating a substep).
     */
    private updateStepStatus(stepKey: string, data: { success: boolean, issue?: Issue }, superStep?: SuperStep) {
      this.stepStatus.set(stepKey, { complete: true, success: data.success, issue: data.issue });
    
      if (superStep && superStep.subSteps.length > 0) {
        this.updateSuperStepStatus(superStep);
      }
      this.displayChecklist();
      this.lastUpdateTime = Date.now();
    }
  
    /**
     * Updates the status of a parent step based on its substeps.
     * @param superStep - The parent step to update.
     */
    private updateSuperStepStatus(superStep: SuperStep) {
      const allSubStepsComplete = superStep.subSteps.every(subStep => this.stepStatus.get(subStep.key)?.complete);
      const allSubStepsSuccess = superStep.subSteps.every(subStep => this.stepStatus.get(subStep.key)?.success);

      this.stepStatus.set(superStep.key, { 
        complete: allSubStepsComplete, 
        success: allSubStepsSuccess,
        issue: undefined
      });
    }
  
    /**
     * Displays the current status of all steps and substeps.
     */
    private displayChecklist() {
      if (!this.logger) {
        console.warn('Logger not initialized yet');
        return;
      }
      // Clear the console
      this.logger.info('\x1Bc'); 
  
      const checklistLines = ['Validation Progress:'];
      let prevComplete = true;
      let validationFailed = false;
      let prevFails = false;

      // Iterate through all steps
      this.steps.forEach((superStep, index) => {
        let thisComplete = true;
        const superStepStatus = this.stepStatus.get(superStep.key);
        if (!superStepStatus?.complete) {
            thisComplete = false;
        }

        // Determine the message and checkmark for the step
        const superStepMessage = (superStepStatus?.complete && prevComplete && !prevFails) ? superStep.message.pastTense : superStep.message.imperative;
        const superStepCheckMark = (superStepStatus?.complete && prevComplete && !prevFails) ? (superStepStatus.success ? '✓' : '✗') : ' ';
        if((superStepStatus?.complete && prevComplete && !prevFails)){
          this.emitter.emit('progress',{step: superStep})
          this.emitter.emit('stepStatusChange',{ stepStatus: Array.from(this.stepStatus.entries()), superStep: superStep })

        }
        checklistLines.push(`[${superStepCheckMark}] ${index + 1}. ${superStepMessage}`);
        
        // Display issue if the step failed
        if (superStepStatus?.complete && prevComplete && !prevFails && !superStepStatus.success && superStepStatus.issue) {
          validationFailed = true;
          checklistLines.push(`   Issue:\n ${formatIssue(superStepStatus.issue)}`);
        }
        if (!superStepStatus?.success && superStep.subSteps.length == 0) {
            prevFails = true;
        }

        // Process substeps
        let subComplete = true;
        superStep.subSteps.forEach((subStep, subIndex) => {
          const subStepStatus = this.stepStatus.get(subStep.key);
          
          const subStepMessage = (subStepStatus?.complete && subComplete && !prevFails) ? subStep.message.pastTense : subStep.message.imperative;
          const subStepCheckMark = (subStepStatus?.complete && subComplete && !prevFails) ? (subStepStatus.success ? '✓' : '✗') : ' ';
          checklistLines.push(`  [${subStepCheckMark}] ${index + 1}.${subIndex + 1}. ${subStepMessage}`);
          if (subStepStatus?.complete && subComplete && !prevFails && !subStepStatus.success && subStepStatus.issue) {
            validationFailed = true;
            checklistLines.push(`     Issue:\n ${formatIssue(subStepStatus.issue)}`);
          }
          if(subStepStatus?.complete && subComplete && !prevFails)
            this.emitter.emit('stepStatusChange',{ stepStatus: Array.from(this.stepStatus.entries()), superStep: superStep })
          if(!subStepStatus?.complete) {
            subComplete = false;
          }
          if(!subStepStatus?.success) {
            prevFails = true;
          }
        });

        prevComplete = thisComplete;
      });
  
  
      // Display the new checklist
      this.logger.info(checklistLines.join('\n'));
      if (validationFailed){
        this.emitter.emit('validation-halted')
      }
      if (this.stepStatus.get('check-variableMeasured')?.success){
        this.emitter.emit('complete')

      }
    }
  
    /**
     * Waits for the validation process to complete.
     * @returns A promise that resolves with the validation result.
     */
    public waitForCompletion(): Promise<void> {
      if (this.result) {
        return Promise.resolve();
      }
  
      return new Promise((resolve) => {
        this.emitter.once('complete', () => {
          resolve();
        });

        this.emitter.once('validation-halted', () => {
          resolve();
        });
      });
    }
}