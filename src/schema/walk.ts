import { psychDSContext, psychDSContextDataset } from "./context.ts";
import { FileTree } from "../types/filetree.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";

/** Recursive algorithm for visiting each file in the dataset, creating a context */
export async function* _walkFileTree(
  fileTree: FileTree,
  root: FileTree,
  issues: DatasetIssues,
  dsContext?: psychDSContextDataset,
): AsyncIterable<psychDSContext> {
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

/** Walk all files in the dataset and construct a context for each one */
export async function* walkFileTree(
  fileTree: FileTree,
  issues: DatasetIssues,
  dsContext?: psychDSContextDataset,
): AsyncIterable<psychDSContext> {
  yield* _walkFileTree(fileTree, fileTree, issues, dsContext);
}
