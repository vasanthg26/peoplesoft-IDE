# SearchInit Event — PeopleCode

## Purpose and When to Use SearchInit

SearchInit fires when the search page is displayed, before the user enters search criteria. It runs once per component invocation and only fires in Add mode and Search/Update modes — it does NOT fire when a component is opened via a direct link or Transfer() that bypasses the search page.

SearchInit PeopleCode is associated with the search record, not the component's primary record.

## Common SearchInit Patterns

### Pre-populate search keys
Default the business unit to the user's default BU so they don't have to type it:
```peoplecode
If %Mode = "A" or %Mode = "U" Then
   SEARCH_RECORD.BUSINESS_UNIT.Value = %OperatorRowLevelSecurityField;
End-If;
```

### Restrict search results
Force the search to only show records for the user's business unit by setting a key and hiding it:
```peoplecode
SEARCH_RECORD.SETID.Value = GetSetId(Field.SETID, Record.DEPT_TBL, SEARCH_RECORD.BUSINESS_UNIT.Value);
Gray(SEARCH_RECORD.SETID);
```

### Set default search mode
Pre-select search criteria to narrow results:
```peoplecode
SEARCH_RECORD.EFF_STATUS.Value = "A";
```

## SearchInit vs RowInit vs FieldDefault

SearchInit fires on the search page BEFORE data is loaded. RowInit fires on the main page AFTER data rows are fetched. FieldDefault fires only when a field is blank and the row is first loaded.

Use SearchInit when you need to control what data the user sees in search results or to default search page field values. Use RowInit for per-row initialization on the main component pages. Use FieldDefault to set initial values on new rows only when the field has no value.

## Important Restrictions

- SearchInit code runs on the SEARCH RECORD, not the component's data records
- Do NOT use Error or Warning in SearchInit — they will prevent the search page from displaying
- SetSearchDialogBehavior() can be called here to control whether the search page appears at all
- In Add mode, SearchInit still fires but search fields are used as key defaults, not search criteria
- %Mode is available: "A" = Add, "U" = Update/Display, "L" = Update/Display All, "C" = Correction
