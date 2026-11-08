import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderCaseCardsMarkdown, renderClinicalReviewMarkdown } from '../core/triage/exportDoc';

const root = process.cwd();
const docsDir = resolve(root, 'docs');
mkdirSync(docsDir, { recursive: true });

writeFileSync(resolve(docsDir, 'clinical-review.md'), renderClinicalReviewMarkdown(), 'utf8');
writeFileSync(resolve(docsDir, 'case-cards.md'), renderCaseCardsMarkdown(), 'utf8');

console.log('Exported docs/clinical-review.md and docs/case-cards.md');
