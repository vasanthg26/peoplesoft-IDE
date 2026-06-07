/**
 * Tests for peopleCodeLinter.js — run with: node --test server/services/peopleCodeLinter.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintPeopleCode } from './peopleCodeLinter.js';

const rulesOf = (res) => res.findings.map((f) => f.rule);

test('clean SaveEdit code produces no errors/warnings', () => {
  const code = `
Local Rowset &rsLine;
Local number &i, &total;
&rsLine = GetLevel0()(1).GetRowset(Scroll.PO_LINE);
&total = 0;
For &i = 1 To &rsLine.ActiveRowCount
   &total = &total + &rsLine(&i).PO_LINE.MERCHANDISE_AMT.Value;
End-For;
If &total = 0 Then
   Error MsgGetText(11100, 10, "Total cannot be zero.");
End-If;
`;
  const res = lintPeopleCode(code, {
    event: 'SaveEdit',
    targetRecord: 'PO_LINE',
    knownFields: ['MERCHANDISE_AMT', 'PO_STATUS'],
  });
  assert.equal(res.summary.errors, 0, JSON.stringify(res.findings));
  assert.equal(res.summary.warnings, 0, JSON.stringify(res.findings));
});

test('detects unbalanced If block', () => {
  const code = `
If &x = 1 Then
   &y = 2;
`;
  const res = lintPeopleCode(code, { event: 'FieldChange' });
  assert.ok(rulesOf(res).includes('unbalanced-block'), JSON.stringify(res.findings));
  assert.ok(res.summary.errors >= 1);
});

test('balanced If with End-If does NOT trip the If-vs-End-If overlap', () => {
  const code = `If &x = 1 Then\n  &y = 2;\nEnd-If;`;
  const res = lintPeopleCode(code, { event: 'SaveEdit' });
  assert.ok(!rulesOf(res).includes('unbalanced-block'), JSON.stringify(res.findings));
});

test('detects unbalanced For block', () => {
  const code = `For &i = 1 To 10\n  &t = &t + 1;\nEnd-For;\nFor &j = 1 To 5\n  &t = &t + 1;`;
  const res = lintPeopleCode(code, { event: 'SaveEdit' });
  assert.ok(rulesOf(res).includes('unbalanced-block'));
});

test('flags Error in RowInit as a hard error', () => {
  const code = `If PO_HDR.PO_STATUS.Value = "X" Then\n   Error MsgGetText(11100, 1, "bad");\nEnd-If;`;
  const res = lintPeopleCode(code, { event: 'RowInit' });
  const f = res.findings.find((x) => x.rule === 'error-warning-placement');
  assert.ok(f, JSON.stringify(res.findings));
  assert.equal(f.severity, 'error');
});

test('flags Warning in SavePreChange as discouraged (warning)', () => {
  const code = `Warning MsgGetText(11100, 2, "heads up");`;
  const res = lintPeopleCode(code, { event: 'SavePreChange' });
  const f = res.findings.find((x) => x.rule === 'error-warning-placement');
  assert.ok(f, JSON.stringify(res.findings));
  assert.equal(f.severity, 'warning');
});

test('does NOT flag Error in SaveEdit', () => {
  const code = `Error MsgGetText(11100, 3, "ok here");`;
  const res = lintPeopleCode(code, { event: 'SaveEdit' });
  assert.ok(!rulesOf(res).includes('error-warning-placement'));
});

test('does NOT count the word "error" inside a string literal', () => {
  const code = `MY_REC.DESCR.Value = "An error occurred while saving";`;
  const res = lintPeopleCode(code, { event: 'RowInit' });
  assert.ok(!rulesOf(res).includes('error-warning-placement'), JSON.stringify(res.findings));
});

test('detects undeclared variable as info', () => {
  const code = `&undeclaredVar = 5;`;
  const res = lintPeopleCode(code, { event: 'FieldChange' });
  const f = res.findings.find((x) => x.rule === 'undeclared-variable');
  assert.ok(f, JSON.stringify(res.findings));
  assert.equal(f.severity, 'info');
});

test('declared variable is not flagged', () => {
  const code = `Local number &declared = 5;\n&declared = &declared + 1;`;
  const res = lintPeopleCode(code, { event: 'FieldChange' });
  assert.ok(!rulesOf(res).includes('undeclared-variable'), JSON.stringify(res.findings));
});

test('signature-annotation params count as declared', () => {
  const code = `method ValidateTotal\n   /+ &poTotal as number +/\n   /+ Returns boolean +/\n   Return (&poTotal = 0);\nend-method;`;
  const res = lintPeopleCode(code, { event: '' });
  assert.ok(!rulesOf(res).includes('undeclared-variable'), JSON.stringify(res.findings));
});

test('flags unknown field on the target record', () => {
  const code = `PO_HDR.NOT_A_FIELD.Value = "x";`;
  const res = lintPeopleCode(code, {
    event: 'FieldChange',
    targetRecord: 'PO_HDR',
    knownFields: ['PO_STATUS', 'VENDOR_ID'],
  });
  const f = res.findings.find((x) => x.rule === 'unknown-field');
  assert.ok(f, JSON.stringify(res.findings));
  assert.equal(f.severity, 'warning');
});

test('known field on the target record is not flagged', () => {
  const code = `PO_HDR.PO_STATUS.Value = "A";`;
  const res = lintPeopleCode(code, {
    event: 'FieldChange',
    targetRecord: 'PO_HDR',
    knownFields: ['PO_STATUS', 'VENDOR_ID'],
  });
  assert.ok(!rulesOf(res).includes('unknown-field'), JSON.stringify(res.findings));
});

test('sibling-record fields are not flagged (only target record checked)', () => {
  const code = `OTHER_REC.SOME_FIELD.Value = "x";`;
  const res = lintPeopleCode(code, {
    event: 'FieldChange',
    targetRecord: 'PO_HDR',
    knownFields: ['PO_STATUS'],
  });
  assert.ok(!rulesOf(res).includes('unknown-field'), JSON.stringify(res.findings));
});

test('empty / placeholder code returns no findings', () => {
  assert.equal(lintPeopleCode('').summary.total, 0);
  assert.equal(lintPeopleCode('/* Code generation failed for this unit */').summary.total, 0);
});

test('balanced Evaluate block is clean', () => {
  const code = `Evaluate PO_HDR.PO_STATUS.Value\nWhen "A"\n   &x = 1;\nWhen-Other\n   &x = 0;\nEnd-Evaluate;`;
  const res = lintPeopleCode(code, { event: 'RowInit', targetRecord: 'PO_HDR', knownFields: ['PO_STATUS'] });
  // &x undeclared -> info only; no errors/warnings
  assert.equal(res.summary.errors, 0, JSON.stringify(res.findings));
  assert.equal(res.summary.warnings, 0, JSON.stringify(res.findings));
});
