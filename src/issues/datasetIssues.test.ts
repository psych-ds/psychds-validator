import { assertEquals, assertTrue } from "../deps/asserts.ts";
import { psychDSFile } from "../types/file.ts";
import { IssueFile } from "../types/issues.ts";
import { DatasetIssues } from "./datasetIssues.ts";

Deno.test("DatasetIssues management class", async (t) => {
  await t.step("Constructor succeeds", () => {
    new DatasetIssues();
  });
  await t.step("add an Issue", () => {
    const issues = new DatasetIssues();
    issues.add({ key: "TEST_ERROR", reason: "Test issue" });
    assertEquals(issues.hasIssue({ key: "TEST_ERROR" }), true);
  });
  await t.step("add Issue with several kinds of files", () => {
    // This mostly tests the issueFile mapping function
    const issues = new DatasetIssues();
    const testStream = new ReadableStream();
    const text = () => Promise.resolve("");
    const files = [
      {
        text,
        name: "dataset_description.json",
        path: "/dataset_description.json",
        size: 500,
        ignored: false,
        stream: testStream,
      } as psychDSFile,
      {
        text,
        name: "README",
        path: "/README",
        size: 500,
        ignored: false,
        stream: testStream,
        line: 1,
        character: 5,
      } as unknown as IssueFile,
    ];
    issues.add({ key: "TEST_FILES_ERROR", reason: "Test issue", files });
    assertEquals(issues.getFileIssueKeys("/README"), ["TEST_FILES_ERROR"]);

    for (const [_, issue] of issues) {
      // Switch to checking properties of object individually to accommodate deep object check
      assertEquals(issue.key, "TEST_FILES_ERROR");
      assertEquals(issue.reason, "Test issue");
      assertEquals(issue.files.size, 2);

      for (const [path, file] of issue.files) {
        assertTrue(file.stream instanceof ReadableStream);
        assertEquals(typeof file.text, "function");

        if (path === "/README") {
          assertEquals(file.name, "README");
          assertEquals(file.line, 1);
          assertEquals(file.character, 5);
        } else if (path === "/dataset_description.json") {
          assertEquals(file.name, "dataset_description.json");
          assertEquals(file.size, 500);
          assertEquals(file.ignored, false);
        }
      }
    }
  });
  await t.step(
    "issues formatted matching the expected IssueOutput type",
    () => {
      const issues = new DatasetIssues();
      issues.add({ key: "TEST_ERROR", reason: "Test issue" });
      assertEquals(issues.hasIssue({ key: "TEST_ERROR" }), true);
      assertEquals(issues.formatOutput(), {
        errors: [
          {
            additionalFileCount: 0,
            code: -9007199254740991,
            files: [],
            helpUrl: "https://neurostars.org/search?q=TEST_ERROR",
            key: "TEST_ERROR",
            reason: "Test issue",
            severity: "error",
          },
        ],
        warnings: [],
      });
    },
  );
});
