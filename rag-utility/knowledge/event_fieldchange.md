# FieldChange Event — PeopleCode

## Purpose and When to Use FieldChange

FieldChange fires after a user modifies a field value and moves focus away from that field, but only if FieldEdit did not issue an error. It is the correct event for logic that reacts to a field change by updating other fields, hiding or showing page elements, or recalculating derived values.

FieldChange is also the correct event for PeopleCode attached to a button or hyperlink. When a user clicks a command button, FieldChange fires on that button's field. This is the standard pattern for triggering actions from a button press — place the button-click handler logic in FieldChange on the button field.

## Common FieldChange Patterns

Derive a related field when the driving field changes: when the user changes a department field, use FieldChange to default the location or manager based on the new department value.

Clear a dependent field when its driver changes: if a fund code field drives a program code field, clear the program code in FieldChange on fund code whenever it changes.

Toggle page element visibility: use SetDisplayField or hide/show logic inside FieldChange to update what the user sees based on the new field value.

Button press handler: attach PeopleCode to the button field's FieldChange event to execute actions when the user clicks the button. This is the only appropriate event for button-triggered logic — do not use FieldEdit for this.

## What FieldChange Should Not Do

Do not use FieldChange for validation that should prevent the new value from being accepted — that belongs in FieldEdit. FieldChange fires after the value is already accepted. Do not issue errors in FieldChange that are intended to stop the field update — by the time FieldChange fires, the update has already occurred.
