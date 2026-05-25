# RowInit Event — PeopleCode

## Purpose and When to Use RowInit

RowInit fires once for each row in the component buffer when the component first loads, and again for each new row that is fetched or inserted into a scroll. It fires before the user sees the page. RowInit is the correct place for display-state initialization — logic that controls how fields appear when the row is first presented to the user.

RowInit is read-only with respect to database values: changes made here are display-only and are not written back to the database unless the user subsequently modifies and saves the row. This makes it safe for conditionally graying fields, setting display formats, or initializing derived display-only fields without polluting the database.

## Common RowInit Patterns

Gray or ungray a field based on row data: check a status field value and call SetFieldProperties or gray the field using the appropriate built-in so the user cannot edit it when the row is in a certain state.

Set display-only defaults: populate a display-only field with a computed label or formatted value derived from other fields on the same row.

Initialize a checkbox or radio button display state: set a field to checked or unchecked based on a flag value in the database record.

Conditional field visibility: hide fields that are not applicable for a given row type or status using SetDisplayField.

## What RowInit Should Not Do

Do not use RowInit for cross-row validation or save logic — those belong in SaveEdit or SavePreChange. Do not use RowInit to update fields that need to be saved; changes here do not trigger a database write unless the user edits and saves afterward. Do not perform expensive external calls such as Component Interface calls or SQL that runs once per row in a large grid — this will cause performance problems on large datasets.
