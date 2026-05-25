# Fatal Exception Events — PeopleCode Error and Warning Restrictions

## Events Where Error and Warning Cause Component Cancellation

Several PeopleCode events treat an Error or Warning statement as a fatal exception, forcing the end-user to cancel the component entirely. These are not graceful validation errors — they crash the component session. Avoid Error and Warning statements in these events unconditionally.

## RowInit — Fatal on Error or Warning

Do not use Error or Warning in RowInit PeopleCode. RowInit fires during component build processing as each row is loaded from the database. An error here causes a runtime error and forces the end-user to cancel the component. There is no graceful recovery. Place all validation in FieldEdit or SaveEdit instead.

## RowInsert — Fatal on Error or Warning

Do not use Error or Warning in RowInsert PeopleCode. RowInsert fires when a new row is added to a scroll. An error here causes a runtime error and forces component cancellation. If you need to prevent row insertion conditionally, use the No Row Insert checkbox in the scroll bar page field properties, or handle the logic in SaveEdit.

## FieldDefault — Fatal on Error or Warning

Do not use Error or Warning in FieldDefault PeopleCode. FieldDefault fires during component initialization to set default field values. An error here causes a runtime error and forces cancellation of the component. FieldDefault is for setting values only — not for validation.

## SavePostChange — Fatal on Error or Warning

Do not use Error or Warning in SavePostChange PeopleCode. By the time SavePostChange fires, the database has already been updated and a commit is pending. An error here causes a runtime error and forces the end-user to cancel without saving changes. Validation must be completed before SavePostChange — use SaveEdit or SavePreChange for that purpose.

## FieldChange — Warning Against Error or Warning

It is not recommended to use Error or Warning statements in FieldChange PeopleCode. All data validation should be performed in FieldEdit. FieldChange is for recalculating values and updating page controls, not for rejecting input.

## Safe Events for Validation

Use FieldEdit for single-field validation that should reject a value immediately. Use SaveEdit for cross-field and cross-row validation that should prevent a save. These are the only two events designed to handle Error and Warning gracefully.
