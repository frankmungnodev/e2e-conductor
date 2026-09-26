# Simplify Review Prompt

Run this prompt before merging any feature or fix branch into `development`.

---

Act as a senior software engineer performing a code quality and maintainability review.

Analyze the entire codebase and identify:

1. Dead code (unused functions, files, components, routes, APIs, variables, imports, and dependencies)
2. Duplicate logic that should be consolidated
3. Unused UI components
4. Overly complex implementations that can be simplified
5. Legacy code that is no longer needed
6. Redundant database queries or API calls
7. Files that appear abandoned or disconnected from the application
8. Opportunities to reduce technical debt

For each issue:

* Explain why it is unnecessary
* Estimate the impact of removing it
* Identify any risks before deletion
* Provide a recommended cleanup plan

Be aggressive but safe. Assume the goal is to simplify the codebase, improve maintainability, and remove anything that does not provide value.
