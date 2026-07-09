import { detectMultilingual } from './multilingual.js';

interface EvalCase {
  name: string;
  text: string;
  expectCommitment: boolean;
  expectLanguage?: string;
}

const CASES: EvalCase[] = [
  { name: 'en-commit', text: "I'll send the report by tomorrow 5pm", expectCommitment: true, expectLanguage: 'en' },
  { name: 'es-commit', text: 'Voy a terminar el informe mañana', expectCommitment: true, expectLanguage: 'es' },
  { name: 'hi-commit', text: 'मैं कल तक रिपोर्ट भेज दूंगा', expectCommitment: true, expectLanguage: 'hi' },
  { name: 'fr-commit', text: "Je finirai le projet vendredi prochain", expectCommitment: true, expectLanguage: 'fr' },
  { name: 'de-commit', text: 'Ich schicke dir die Dateien morgen früh', expectCommitment: true, expectLanguage: 'de' },
  { name: 'en-noncommit', text: 'The weather is nice today', expectCommitment: false, expectLanguage: 'en' },
  { name: 'ja-noncommit', text: '今日はいい天気ですね', expectCommitment: false, expectLanguage: 'ja' },
  { name: 'empty', text: '   ', expectCommitment: false },
];

async function run() {
  let passed = 0;
  let langCorrect = 0;
  let langTotal = 0;
  const failures: string[] = [];

  const refDate = new Date('2026-07-09T09:00:00Z');

  for (const c of CASES) {
    const res = await detectMultilingual(c.text, { referenceDate: refDate });
    const gotCommit = res?.isCommitment ?? false;
    const ok = gotCommit === c.expectCommitment;

    if (ok) passed++;
    else failures.push(`${c.name}: expected isCommitment=${c.expectCommitment}, got ${gotCommit}`);

    if (c.expectLanguage && res) {
      langTotal++;
      if (res.language === c.expectLanguage) langCorrect++;
      else failures.push(`${c.name}: lang expected ${c.expectLanguage}, got ${res.language}`);
    }

    console.log(
      `[${ok ? 'PASS' : 'FAIL'}] ${c.name.padEnd(14)} ` +
      `commit=${gotCommit} lang=${res?.language ?? '-'} conf=${res?.confidence ?? '-'}`,
    );
  }

  const acc = ((passed / CASES.length) * 100).toFixed(1);
  const langAcc = langTotal ? ((langCorrect / langTotal) * 100).toFixed(1) : 'n/a';

  console.log('\n──── Eval Summary ────');
  console.log(`Commitment accuracy: ${acc}% (${passed}/${CASES.length})`);
  console.log(`Language accuracy:   ${langAcc}% (${langCorrect}/${langTotal})`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
