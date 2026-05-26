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
