# Meta-SQL Patterns — PeopleCode Reference

## What is Meta-SQL

Meta-SQL consists of special constructs (prefixed with %) that PeopleTools resolves into platform-specific SQL at runtime. They ensure portability across Oracle, SQL Server, and DB2 without hard-coding platform syntax. Meta-SQL is used inside SQLExec, CreateSQL, SQL objects, and Application Engine SQL actions.

## %EffDtCheck — Effective-Date Filtering

Generates a standard effective-date subquery to return the most current active row as of a given date.

Syntax: `%EffDtCheck(record_alias, outer_alias, as_of_date)`

```sql
SELECT A.SETID, A.DEPT_ID, A.DESCR
FROM PS_DEPT_TBL A
WHERE A.SETID = :1
AND A.DEPT_ID = :2
AND %EffDtCheck(DEPT_TBL A, %CurrentDateIn)
```

Expands to something like:
```sql
AND A.EFFDT = (SELECT MAX(A1.EFFDT) FROM PS_DEPT_TBL A1
               WHERE A1.SETID = A.SETID AND A1.DEPT_ID = A.DEPT_ID
               AND A1.EFFDT <= SYSDATE)
```

Use %EffDtCheck whenever querying an effective-dated table (DEPT_TBL, JOB, POSITION_DATA, LOCATION_TBL, etc.) to get the current effective row. Always pair with %CurrentDateIn or a specific date bind.

## %EffSeqCheck — Effective-Sequence Filtering

For records that have BOTH EFFDT and EFFSEQ (multiple actions on the same date, e.g. JOB, COMPENSATION), %EffDtCheck alone resolves the date but not the sequence. Pair it with %EffSeqCheck to select the highest EFFSEQ for the resolved EFFDT.

Syntax: `%EffSeqCheck(record_alias, outer_alias, as_of_date)`

```sql
SELECT A.ACTION, A.ACTION_REASON
FROM PS_JOB A
WHERE A.EMPLID = :1 AND A.EMPL_RCD = :2
AND %EffDtCheck(JOB A1, A, %CurrentDateIn)
AND %EffSeqCheck(JOB A2, A, %CurrentDateIn)
```

Expands to a MAX(EFFSEQ) correlated subquery for the resolved EFFDT. Omitting %EffSeqCheck on an EFFSEQ record returns the wrong row whenever same-day actions exist.

## %CurrentDateIn and %CurrentDateOut

- `%CurrentDateIn` — returns the current date in platform-native format for use in WHERE clauses and INSERTs. On Oracle: SYSDATE. On SQL Server: GETDATE().
- `%CurrentDateOut` — wraps a date column for SELECT output to ensure consistent formatting across platforms.
- `%CurrentTimeIn` — current timestamp including time component.
- `%DateIn(:bind)` — converts a PeopleCode date variable into platform-native format for SQL binds.
- `%DateOut(column)` — converts a database date column into PeopleCode-readable format in SELECT output.

```peoplecode
Local date &dtToday;
SQLExec("SELECT %DateOut(A.EFFDT) FROM PS_JOB A WHERE A.EMPLID = :1 AND A.EFFDT <= %CurrentDateIn ORDER BY A.EFFDT DESC", &emplid, &dtToday);
```

## %SelectAll — Full Row Select

Generates a SELECT for all columns in a record definition, in the correct order.

Syntax: `%SelectAll(record_name, alias)`

```sql
%SelectAll(DEPT_TBL A)
```

Expands to: `SELECT A.SETID, A.DEPT_ID, A.EFFDT, A.EFF_STATUS, A.DESCR, ...`

Use %SelectAll when you need all columns and want to avoid manually listing them. Commonly used with record object Fill() operations.

## %InsertSelect — Insert from Select

Combines INSERT and SELECT into a platform-independent operation. Inserts rows from one table into another with matching structure.

Syntax: `%InsertSelect(target_record, source_record, alias)`

```sql
%InsertSelect(MY_STG_TBL, MY_SRC_TBL A)
WHERE A.PROCESS_INSTANCE = :1
```

Use in Application Engine SQL actions or SQLExec for bulk data movement. The target and source records must have compatible column definitions.

## %Insert — Single Row Insert

Generates a platform-independent INSERT statement for a record.

Syntax: `%Insert(record_name)`

```sql
%Insert(MY_AUDIT_TBL)
```

Expands to: `INSERT INTO PS_MY_AUDIT_TBL (COL1, COL2, ...) VALUES (:1, :2, ...)`

## %Update — Single Row Update

Generates a platform-independent UPDATE for all non-key columns, using key columns in the WHERE clause.

Syntax: `%Update(record_name, alias)`

Commonly used in Application Engine steps for row-by-row processing.

## %Delete and %DeleteAll

- `%Delete(record_name)` — deletes rows by key fields (uses bind parameters for keys).
- `%DeleteAll(record_name)` — deletes ALL rows from the table. Use with extreme caution.

## %Join — Record Join

Generates join conditions by matching key fields between two records.

Syntax: `%Join(join_type, record1, alias1, record2, alias2)`

```sql
SELECT A.EMPLID, A.NAME
FROM PS_JOB A, PS_PERSONAL_DATA B
WHERE %Join(COMMON_KEYS, JOB A, PERSONAL_DATA B)
AND %EffDtCheck(JOB A, %CurrentDateIn)
```

Join types: COMMON_KEYS (all shared key fields), or specify individual key fields.

## %SelectByKey and %SelectByKeyEffDt

- `%SelectByKey(record_name)` — SELECT all columns with WHERE clause on all key fields.
- `%SelectByKeyEffDt(record_name)` — same as above but adds effective-date filtering.

These generate complete SELECT statements that can be used directly with SQLExec or CreateSQL.

## %TruncateTable

Platform-independent table truncation.

Syntax: `%TruncateTable(record_name)`

On Oracle: `TRUNCATE TABLE PS_record_name`. On SQL Server: `TRUNCATE TABLE PS_record_name`. Faster than DELETE for bulk removal.

## %Table — Record to Table Name

Converts a PeopleSoft record name to its physical table name.

Syntax: `%Table(record_name)`

Returns `PS_RECORD_NAME` for standard records. Use when building dynamic SQL or when you need the physical table name.

## %SQL — Reusable SQL Definitions

References a SQL definition stored in Application Designer.

Syntax: `%SQL(sql_definition_name, bind1, bind2, ...)`

Promotes SQL reuse across multiple PeopleCode programs and Application Engine steps.

## Common Meta-SQL Patterns in PeopleCode Events

### SavePreChange — Stamp audit fields
```peoplecode
SQLExec("UPDATE %Table(MY_TBL) SET LASTUPDDTTM = %CurrentTimeIn, LASTUPDOPRID = :1 WHERE KEY1 = :2", %OperatorId, &key1);
```

### SavePostChange — Insert audit trail
```peoplecode
SQLExec("%Insert(MY_AUDIT_TBL)", &key1, &key2, %OperatorId, %CurrentDateIn, &oldValue, &newValue);
```

### FieldChange — Effective-dated lookup
```peoplecode
SQLExec("SELECT %DateOut(A.EFFDT), A.DESCR FROM PS_DEPT_TBL A WHERE A.SETID = :1 AND A.DEPT_ID = :2 AND %EffDtCheck(DEPT_TBL A, %CurrentDateIn)", &setid, &deptid, &effdt, &descr);
```

### SaveEdit — Existence check with effective date
```peoplecode
Local string &exists;
SQLExec("SELECT 'X' FROM PS_VENDOR A WHERE A.VENDOR_ID = :1 AND %EffDtCheck(VENDOR A, %CurrentDateIn)", &vendorId, &exists);
If None(&exists) Then
   Error MsgGet(11100, 20, "Vendor does not exist or is not active.");
End-If;
```
