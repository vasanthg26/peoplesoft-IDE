# PeopleSoft Meta Table SQLs

## SQL1 - Component Scroll Levels
SELECT DISTINCT D.recname     TableName,
                D.occurslevel ScrollName
FROM   pspnlgrpdefn A,
       pspnlgroup B,
       pspnldefn C,
       pspnlfield D,
       psrecdefn E
WHERE  A.pnlgrpname = B.pnlgrpname
       AND A.market = B.market
       AND B.pnlname = C.pnlname
       AND C.pnlname = D.pnlname
       AND A.pnlgrpname = :1
       AND E.recname = D.recname
       AND E.rectype IN ( 0 )
       AND To_char(Bitand(D.fielduse, 16)) <> '16'
ORDER  BY 2,1

## SQL2 - All Records Including Subpages
SELECT DISTINCT B.RECNAME
FROM PSPNLGROUP A, PSPNLFIELD B, PSRECDEFN C
WHERE A.PNLGRPNAME = :1
AND B.PNLNAME = A.PNLNAME
AND B.RECNAME <> ' '
AND B.ASSOCFIELDNUM = 0
AND B.FIELDNUM = (SELECT MIN(D.FIELDNUM) FROM PSPNLFIELD D
                  WHERE D.PNLNAME = B.PNLNAME
                  AND D.RECNAME = B.RECNAME
                  AND D.OCCURSLEVEL = B.OCCURSLEVEL)
AND C.RECNAME = B.RECNAME
AND C.RECTYPE = 0
UNION
SELECT DISTINCT B.RECNAME
FROM PSPNLFIELD B, PSRECDEFN C,
    (SELECT E.SUBPNLNAME, E.OCCURSLEVEL
     FROM PSPNLFIELD E
     WHERE E.SUBPNLNAME <> ' '
     AND EXISTS (SELECT 'X' FROM PSPNLGROUP F
                 WHERE F.PNLGRPNAME = :1
                 AND F.PNLNAME = E.PNLNAME)) D
WHERE B.RECNAME <> ' '
AND B.ASSOCFIELDNUM = 0
AND B.FIELDNUM = (SELECT MIN(D.FIELDNUM) FROM PSPNLFIELD D
                  WHERE D.PNLNAME = B.PNLNAME
                  AND D.RECNAME = B.RECNAME
                  AND D.OCCURSLEVEL = B.OCCURSLEVEL)
AND C.RECNAME = B.RECNAME
AND C.RECTYPE = 0
AND D.SUBPNLNAME = B.PNLNAME

## SQL3 - All Fields in Component
SELECT cp.pnlgrpname,
       cp.market,
       cp.descr,
       cpg.pnlname,
       cpg.itemlabel,
       pg.descr,
       pgf.fieldtype,
       pgf.lbltext,
       pgf.recname,
       pgf.fieldname
FROM   pspnlgrpdefn cp,
       pspnlgroup cpg,
       pspnldefn pg,
       pspnlfield pgf
WHERE  cp.pnlgrpname = :1
       AND cp.market = :2
       AND cp.pnlgrpname = cpg.pnlgrpnam
       AND cp.market = cp.market
       AND pg.pnlname = cpg.pnlname
       AND pgf.pnlname = pg.pnlname

## SQL4 - All Records with Type Decoded
SELECT R.RECNAME AS RECORD_NAME,
       (CASE
          WHEN R.RECTYPE = 0 THEN 'Table'
          WHEN R.RECTYPE = 1 THEN 'View'
          WHEN R.RECTYPE = 2 THEN 'Derived'
          WHEN R.RECTYPE = 3 THEN 'Sub Record'
          WHEN R.RECTYPE = 5 THEN 'Dynamic View'
          WHEN R.RECTYPE = 6 THEN 'Query View'
          WHEN R.RECTYPE = 7 THEN 'Temporary Table'
          ELSE 'Unknown'
        END) AS RECORD_TYPE
FROM   PSRECDEFN R
WHERE  R.RECNAME IN
       (SELECT DISTINCT RECNAME FROM PSPNLFIELD
        WHERE PNLNAME IN
              (SELECT DISTINCT B.PNLNAME
               FROM PSPNLGROUP A, PSPNLFIELD B
               WHERE (A.PNLNAME = B.PNLNAME OR A.PNLNAME = B.SUBPNLNAME)
               AND A.PNLGRPNAME = :1
               AND RECNAME <> ' ')
        UNION
        SELECT DISTINCT RECNAME FROM PSPNLFIELD
        WHERE PNLNAME IN
              (SELECT DISTINCT B.SUBPNLNAME
               FROM PSPNLGROUP A, PSPNLFIELD B
               WHERE (A.PNLNAME = B.PNLNAME OR A.PNLNAME = B.SUBPNLNAME)
               AND A.PNLGRPNAME = :1))
AND R.RECNAME <> ' '
ORDER BY R.RECTYPE

## SQL5 - Record Fields with Keys
SELECT R.RECNAME,
       R.FIELDNUM,
       R.FIELDNAME,
       D.FIELDTYPE,
       D.LENGTH,
       CASE MOD(R.USEEDIT, 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_KEY,
       CASE MOD((R.USEEDIT/256), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_REQUIRED,
       CASE MOD((R.USEEDIT/2048), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_SEARCH_KEY,
       CASE MOD((R.USEEDIT/32), 2)
            WHEN 1 THEN 'Y' ELSE ' '
       END AS IS_LIST_BOX
FROM   PSRECFIELD R,
       PSDBFIELD D
WHERE  R.RECNAME = :1
AND    R.FIELDNAME = D.FIELDNAME
ORDER  BY R.FIELDNUM

## SQL6 - PeopleCode by Event
SELECT OBJECTVALUE1  AS RECORD_NAME,
       OBJECTVALUE2  AS FIELD_NAME,
       OBJECTVALUE3  AS EVENT_NAME,
       PCTEXT        AS PEOPLECODE
FROM   PSPCMTXT
WHERE  OBJECTID1 = 1
AND    OBJECTID2 = 2
AND    OBJECTID3 = 12
AND    OBJECTVALUE1 = :1
ORDER  BY OBJECTVALUE1, OBJECTVALUE2, OBJECTVALUE3

## SQL7 - FUNCLIB Functions
SELECT OBJECTVALUE1  AS FUNCLIB_NAME,
       OBJECTVALUE2  AS FIELD_NAME,
       OBJECTVALUE3  AS EVENT_NAME,
       PCTEXT        AS PEOPLECODE
FROM   PSPCMTXT
WHERE  OBJECTID1 = 1
AND    OBJECTVALUE1 LIKE 'FUNCLIB%'
AND    OBJECTVALUE1 = :1
ORDER  BY OBJECTVALUE2

## SQL8 - Translate Values (XLAT)
SELECT X.FIELDNAME,
       X.FIELDVALUE,
       X.XLATLONGNAME,
       X.XLATSHORTNAME,
       X.EFF_STATUS,
       X.EFFDT
FROM   PSXLATITEM X
WHERE  X.FIELDNAME = :1
AND    X.EFF_STATUS = 'A'
AND    X.EFFDT = (SELECT MAX(X2.EFFDT)
                  FROM   PSXLATITEM X2
                  WHERE  X2.FIELDNAME = X.FIELDNAME
                  AND    X2.FIELDVALUE = X.FIELDVALUE
                  AND    X2.EFFDT <= SYSDATE)
ORDER  BY X.FIELDVALUE
