import { validateContent, formatIssues } from '../src/data/validate.ts';

const issues = validateContent();
if (issues.length > 0) {
  console.error(`Content validation failed:\n${formatIssues(issues)}`);
  process.exit(1);
}
console.log('Content validation passed.');
