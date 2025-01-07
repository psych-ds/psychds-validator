/**
 * @fileoverview Provides functionality for walking through a dataset's file tree
 * and creating validation contexts for each file. Handles recursive directory
 * traversal and context generation.
 */

import { psychDSContext, psychDSContextDataset } from "./context.ts";
import { FileTree } from "../types/filetree.ts";
import { DatasetIssues } from "../issues/datasetIssues.ts";

/**
 * Recursively walks through a file tree and yields contexts for each file
 * 
 * This internal implementation handles the recursive traversal of directories
 * and maintains the root reference for proper context creation. When traversing
 * root-level directories, they are added to the dataset context's baseDirs.
 * 
 * @param fileTree - Current directory tree being processed
 * @param root - Root of the complete file tree (preserved during recursion)
 * @param issues - Collection for tracking validation issues
 * @param dsContext - Optional dataset-level context
 * @yields psychDSContext for each file encountered
 */
export async function* _walkFileTree(
  fileTree: FileTree,
  root: FileTree,
  issues: DatasetIssues,
  dsContext?: psychDSContextDataset,
): AsyncIterable<psychDSContext> {
  // Process all files in current directory
  for (const file of fileTree.files) {
    yield new psychDSContext(root, file, issues, dsContext);
  }

  // Recursively process subdirectories
  for (const dir of fileTree.directories) {
    // Track root-level directories in dataset context
    if (fileTree.path === "/" && dsContext) {
      dsContext.baseDirs = [...dsContext.baseDirs, `/${dir.name}`];
    }
    // Recursively walk subdirectory
    yield* _walkFileTree(dir, root, issues, dsContext);
  }
}

/**
 * Public interface for walking a file tree and creating validation contexts
 * 
 * This function initializes the recursive walk of a dataset's file tree,
 * creating a validation context for each file encountered. It preserves the
 * complete tree structure while traversing to ensure proper context creation.
 * 
 * @param fileTree - File tree to walk
 * @param issues - Collection for tracking validation issues
 * @param dsContext - Optional dataset-level context
 * @yields psychDSContext for each file in the tree
 * 
 */
export async function* walkFileTree(
  fileTree: FileTree,
  issues: DatasetIssues,
  dsContext?: psychDSContextDataset,
): AsyncIterable<psychDSContext> {
  yield* _walkFileTree(fileTree, fileTree, issues, dsContext);
}