# SaveEdit vs FieldEdit — PeopleCode Validation Events

## FieldEdit — Field-Level Validation

FieldEdit fires immediately after the user changes a field value and moves focus away, before FieldChange. Its sole purpose is to validate the new value and optionally reject it by issuing an error message. If FieldEdit issues an error, the field value is not accepted, the cursor stays on the field, and FieldChange does not fire.

Use FieldEdit when the validation applies only to the field's own value and does not depend on other fields or the state of the save. For example: validate that a date field is not in the past, that a numeric field falls within an allowed range, or that a code field exists in a prompt table.

## FieldEdit Loop Anti-Pattern

A common mistake is placing FieldEdit PeopleCode on a field that is also updated programmatically by other PeopleCode (e.g., FieldChange or RowInit). Every programmatic assignment to the field will re-fire FieldEdit. This creates infinite loops or unexpected validation errors on values that were set by the system, not the user. If you need to validate a field that is also set programmatically, add a guard flag or use SaveEdit instead.

## SaveEdit — Cross-Field and Cross-Row Validation

SaveEdit fires when the user clicks Save, after all FieldEdit and FieldChange processing is complete but before any SQL writes. It fires on every active row at every scroll level in the component buffer.

Use SaveEdit when the validation depends on the combination of multiple fields, the relationship between rows, or conditions that can only be checked at save time. For example: ensure a required combination of fields is complete, validate that the sum of child rows equals a header total, or check a business rule that spans multiple records.

SaveEdit can issue errors to prevent the save or warnings to ask for confirmation. If any SaveEdit fires an error, the save is aborted and no SQL writes occur.

## Choosing the Right Event

If the check only needs the field's own new value: use FieldEdit. If the check requires other fields on the same row or multiple rows: use SaveEdit. If you need to stop a save based on a condition that may change after field entry (e.g., a status field changed by another event): use SaveEdit, not FieldEdit, because FieldEdit on a status field may not fire again if the status was set by FieldChange on a different field.
