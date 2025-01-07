import { CheckFunction } from "../../types/check.ts";

// Non-schema EMPTY_FILE implementation
export const emptyFile: CheckFunction = (_schema, context) => {
  if (context.file.size === 0) {
    context.issues.addSchemaIssue("FileEmpty", [context.file]);
  }
  return Promise.resolve();
};
