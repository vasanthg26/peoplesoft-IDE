# PeopleCode Event Execution Order

## Component Processor Event Flow

The PeopleCode event execution order determines when each event fires relative to user actions and the component lifecycle. Understanding this order is essential for placing validation, defaulting, and save logic correctly.

When a component first loads, the Panel Processor fires events in this sequence: SearchInit, SearchSave (after the user submits the search), then for each row in the component buffer: RowInit fires on every row at every scroll level, followed by PostBuild. FieldDefault fires for any field that has no value yet. FieldFormula fires after FieldDefault.

When a user changes a field value and tabs out, the sequence is: FieldEdit fires first (validation — can reject the change), then FieldChange fires (update related fields based on the new value). If FieldEdit issues an error, FieldChange does not fire.

When a user clicks Save, the sequence is: SaveEdit fires first (cross-field and cross-row validation — can reject the save), then SavePreChange (last chance to modify data before the SQL write), then the actual SQL INSERT/UPDATE executes, then SavePostChange (post-save actions such as calling an Application Engine or writing audit rows).

When a user inserts a row in a grid or scroll, RowInsert fires on the new row. When a user deletes a row, RowDelete fires — placing an error here prevents the deletion.

## Event Order Summary Table

The order from first to last within a save cycle: RowInit (on load) → FieldDefault → FieldFormula → FieldEdit (on field change) → FieldChange (on field change) → SaveEdit (on save) → SavePreChange (on save) → SQL write → SavePostChange (on save).

## Key Rules for Event Placement

Place validation that should reject a field value in FieldEdit. Place logic that derives or updates other fields based on a changed value in FieldChange. Place cross-field or multi-row save validation in SaveEdit. Place data modifications that must be committed in the same transaction in SavePreChange. Place actions that depend on the row already existing in the database (audit, downstream updates) in SavePostChange. Place display-only initialization such as graying fields or setting display flags in RowInit.
