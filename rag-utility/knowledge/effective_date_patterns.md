# Effective Date Patterns — PeopleCode Reference

## What is Effective Dating

Effective dating is PeopleSoft's mechanism for maintaining historical, current, and future-dated data in a single table. An effective-dated table has EFFDT as a key field, and optionally EFFSEQ (effective sequence) for multiple rows on the same date. The most current row is the one with the highest EFFDT that is less than or equal to today.

## Core Concepts

- **EFFDT** (Effective Date): Key field that determines when a row becomes active.
- **EFFSEQ** (Effective Sequence): Numeric key for multiple actions on the same date (e.g., two job changes on the same day).
- **EFF_STATUS** (Effective Status): A = Active, I = Inactive. Controls whether the row is logically active as of its effective date.
- **Current row**: The row with MAX(EFFDT) <= today AND (highest EFFSEQ if applicable).
- **Future row**: EFFDT > today. Exists but is not yet in effect.
- **History row**: A prior EFFDT row that has been superseded by a more recent one.

## SQL Patterns for Effective-Dated Tables

### Get the current effective row
```sql
SELECT A.DESCR
FROM PS_DEPT_TBL A
WHERE A.SETID = :1
AND A.DEPT_ID = :2
AND A.EFFDT = (SELECT MAX(A1.EFFDT)
               FROM PS_DEPT_TBL A1
               WHERE A1.SETID = A.SETID
               AND A1.DEPT_ID = A.DEPT_ID
               AND A1.EFFDT <= SYSDATE)
AND A.EFF_STATUS = 'A'
```

Or use Meta-SQL: `AND %EffDtCheck(DEPT_TBL A, %CurrentDateIn)`

### Get the current row with effective sequence
```sql
SELECT A.ACTION, A.ACTION_REASON
FROM PS_JOB A
WHERE A.EMPLID = :1
AND A.EMPL_RCD = :2
AND A.EFFDT = (SELECT MAX(A1.EFFDT) FROM PS_JOB A1
               WHERE A1.EMPLID = A.EMPLID AND A1.EMPL_RCD = A.EMPL_RCD
               AND A1.EFFDT <= SYSDATE)
AND A.EFFSEQ = (SELECT MAX(A2.EFFSEQ) FROM PS_JOB A2
                WHERE A2.EMPLID = A.EMPLID AND A2.EMPL_RCD = A.EMPL_RCD
                AND A2.EFFDT = A.EFFDT)
```

## PeopleCode Patterns for Effective-Dated Records

### FieldChange — Default EFFDT based on mode
```peoplecode
If %Mode = "A" Then
   MY_RECORD.EFFDT.Value = %Date;
   MY_RECORD.EFFSEQ.Value = 0;
End-If;
```

### FieldChange — Auto-increment EFFSEQ for same-date inserts
```peoplecode
Local number &maxSeq;
SQLExec("SELECT MAX(A.EFFSEQ) FROM PS_JOB A WHERE A.EMPLID = :1 AND A.EMPL_RCD = :2 AND A.EFFDT = %DateIn(:3)", &emplid, &emplRcd, &effdt, &maxSeq);
JOB.EFFSEQ.Value = &maxSeq + 1;
```

### SaveEdit — Validate no future-dated rows exist
```peoplecode
Local string &futureExists;
SQLExec("SELECT 'X' FROM PS_MY_TBL A WHERE A.KEY1 = :1 AND A.EFFDT > %DateIn(:2)", &key1, &effdt, &futureExists);
If All(&futureExists) Then
   Error MsgGet(11100, 30, "Cannot insert a row before an existing future-dated row.");
End-If;
```

### SaveEdit — Ensure EFFDT is not in the past for new rows
```peoplecode
If %Mode = "A" And MY_RECORD.EFFDT.Value < %Date Then
   Error MsgGet(11100, 31, "Effective date cannot be in the past for new entries.");
End-If;
```

## %Mode and Effective-Dated Records

%Mode indicates the component's current data entry mode:

| Mode | Value | Meaning | EFFDT behavior |
|---|---|---|---|
| Add | "A" | New key combination | EFFDT defaults to today, EFFSEQ = 0 |
| Update/Display | "U" | Existing key, latest EFFDT row loaded | New EFFDT row creates history |
| Update/Display All | "L" | All EFFDT rows visible | All history rows editable |
| Correction | "C" | Edit current effective row in place | No new EFFDT row inserted |

When generating code for effective-dated records, always consider %Mode:
- In Add mode, default EFFDT to %Date and EFFSEQ to 0
- In Update mode, a new row with today's EFFDT is being inserted — prior rows become history
- In Correction mode, the existing current row is being edited directly
- In Update/Display All mode, all effective-dated rows are visible and editable

## Meta-SQL for Effective-Date Resolution

Prefer Meta-SQL over hand-written correlated subqueries — it is platform-independent and less error-prone.

- **%EffDtCheck(recname alias, asofdate)** — expands to the full `EFFDT = (SELECT MAX(EFFDT) ... <= asofdate)` correlated subquery. Pass `%CurrentDateIn` (or a bind) as the as-of date.
  ```sql
  SELECT A.DESCR FROM PS_DEPT_TBL A
  WHERE A.SETID = :1 AND A.DEPT_ID = :2
  AND %EffDtCheck(DEPT_TBL A1, A, %CurrentDateIn)
  AND A.EFF_STATUS = 'A'
  ```
- **%EffSeqCheck(recname alias, corr_alias, asofdate)** — same idea for EFFSEQ; expands to `EFFSEQ = (SELECT MAX(EFFSEQ) ...)` for the resolved EFFDT. Use together with %EffDtCheck for EMPL-style records (JOB, COMPENSATION).
- **%CurrentDateIn / %CurrentDateOut** — platform-independent "today" in/out of SQL.
- **%DateIn(:n) / %DateOut** — wrap a bind/column so dates compare correctly across databases. Always wrap EFFDT binds in `%DateIn` inside SQLExec.

## Fetching a Prior (History) Row

To read the row that was in effect on a specific past date (not necessarily today), resolve EFFDT as of that date:
```peoplecode
Local date &asOfDate = MY_RECORD.TRANSACTION_DT.Value;
Local string &rate;
SQLExec("SELECT A.RATE FROM PS_RATE_TBL A WHERE A.SETID = :1 AND A.RATE_CD = :2 AND A.EFFDT = (SELECT MAX(A1.EFFDT) FROM PS_RATE_TBL A1 WHERE A1.SETID = A.SETID AND A1.RATE_CD = A.RATE_CD AND A1.EFFDT <= %DateIn(:3)) AND A.EFF_STATUS = 'A'", &setid, &rateCd, &asOfDate, &rate);
```
Rule: NEVER hard-code `<= SYSDATE` when the business event has its own effective date — resolve as of the transaction/as-of date the requirement specifies.

## Future-Dated Change Handling

Future-dated rows (EFFDT > today) exist in the table but are not yet in effect. Common patterns:

### Warn (not Error) when a future-dated row will be superseded
```peoplecode
Local string &futureExists;
SQLExec("SELECT 'X' FROM PS_MY_TBL A WHERE A.KEY1 = :1 AND A.EFFDT > %DateIn(:2)", &key1, MY_TBL.EFFDT.Value, &futureExists);
If All(&futureExists) Then
   Warning MsgGetText(11100, 32, "A future-dated row exists; verify your change does not conflict.");
End-If;
```
Use **Warning** (override allowed) for advisory future-row conflicts; use **Error** only when the requirement says the change must be blocked.

### Prevent inserting an effective date earlier than the latest history row
```peoplecode
Local date &maxEffdt;
SQLExec("SELECT MAX(A.EFFDT) FROM PS_MY_TBL A WHERE A.KEY1 = :1", &key1, &maxEffdt);
If %Mode = "A" And MY_TBL.EFFDT.Value <= &maxEffdt Then
   Error MsgGetText(11100, 33, "Effective date must be later than the most recent existing row.");
End-If;
```

## EFFSEQ Chains (Multiple Rows on the Same Date)

When several actions occur on the same EFFDT (e.g., two JOB actions in one day), EFFSEQ orders them. The "current" action is MAX(EFFSEQ) for the MAX(EFFDT).

### Get next EFFSEQ for a same-date insert
```peoplecode
Local number &nextSeq;
SQLExec("SELECT NVL(MAX(A.EFFSEQ), -1) + 1 FROM PS_JOB A WHERE A.EMPLID = :1 AND A.EMPL_RCD = :2 AND A.EFFDT = %DateIn(:3)", &emplid, &emplRcd, JOB.EFFDT.Value, &nextSeq);
JOB.EFFSEQ.Value = &nextSeq;
```
`NVL(MAX(EFFSEQ), -1) + 1` yields 0 for the first row of a new date and increments thereafter.

## Effective-Dated Rows in the Component Buffer

Effective-dated detail records often appear as a scroll (grid) where each row is an EFFDT/EFFSEQ combination. To find the current effective row in the buffer (rather than via SQL):
```peoplecode
Local Rowset &rsHist;
Local Row &rowCurrent;
Local integer &i;
Local date &maxEffdt = Date3(1900, 1, 1);
&rsHist = GetLevel0()(1).GetRowset(Scroll.JOB);
For &i = 1 To &rsHist.ActiveRowCount
   If &rsHist(&i).JOB.EFFDT.Value <= %Date And &rsHist(&i).JOB.EFFDT.Value >= &maxEffdt Then
      &maxEffdt = &rsHist(&i).JOB.EFFDT.Value;
      &rowCurrent = &rsHist.GetRow(&i);
   End-If;
End-For;
```
Then read fields from `&rowCurrent` once the current row is identified.

## Cross-Effective-Dating (Parent EFFDT Drives Child Lookup)

When a child/related record must be resolved as of the parent's effective date (e.g., a salary rate effective within a JOB row's EFFDT), pass the PARENT's EFFDT as the as-of date — do NOT use today:
```peoplecode
SQLExec("SELECT A.COMPRATE FROM PS_SAL_GRADE_TBL A WHERE A.SETID = :1 AND A.SAL_GRADE = :2 AND A.EFFDT = (SELECT MAX(A1.EFFDT) FROM PS_SAL_GRADE_TBL A1 WHERE A1.SETID = A.SETID AND A1.SAL_GRADE = A.SAL_GRADE AND A1.EFFDT <= %DateIn(:3))", &setid, &salGrade, JOB.EFFDT.Value, &compRate);
```

## Common Effective-Dating Pitfalls

- **Using SYSDATE/%Date when the business event has its own date** — resolve as of the transaction/parent EFFDT, not today.
- **Forgetting EFF_STATUS = 'A'** — a current row can be logically Inactive; filter on EFF_STATUS unless inactive rows are wanted.
- **Ignoring EFFSEQ on records that have it** — fetching MAX(EFFDT) without MAX(EFFSEQ) returns the wrong row when same-day actions exist.
- **Not wrapping date binds in %DateIn** — causes cross-platform comparison failures in SQLExec.
- **Correction vs Update confusion** — in Correction mode do NOT insert a new EFFDT row; edit in place. In Update mode a new dated row becomes the current row and prior rows become history.
- **Blocking instead of warning on future rows** — prefer Warning for advisory future-row conflicts unless the requirement explicitly says to block.
