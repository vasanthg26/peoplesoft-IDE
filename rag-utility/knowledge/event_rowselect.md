# RowSelect Event — PeopleCode

## Purpose and When to Use RowSelect

RowSelect fires at the beginning of the Component Build process in Update action modes (Update, Update/Display All, Correction). It also fires after a ScrollSelect or related function is executed. RowSelect PeopleCode is used to filter rows of data as they are being read into the component buffer — before they are displayed to the user.

RowSelect is the correct event for conditionally excluding rows from the component buffer based on data values. It runs per-row as each row is fetched from the database.

## Key Functions Used in RowSelect

DiscardRow causes the Component Processor to skip the current row and continue processing other rows. The skipped row is not loaded into the component buffer and is not visible to the user.

StopFetching causes the Component Processor to accept the current row and then stop reading any additional rows. No further rows are fetched from the database.

If both DiscardRow and StopFetching are executed in the same RowSelect program, the current row is skipped and fetching stops — no further rows are loaded.

## Restriction — Current Record Only

In RowSelect PeopleCode, you can only reference fields on the record that is currently being processed. You cannot reference fields from other records or other scroll levels within RowSelect. This is a hard restriction enforced by the Component Processor.

## Component Interface Restriction

RowSelect, and all its associated PeopleCode, does not fire when the component is run from a Component Interface. Design accordingly — do not rely on RowSelect filtering for data integrity; it is a display-layer filter only.

## When Not to Use RowSelect

Do not use RowSelect as a security or data integrity filter — it only affects what is loaded into the component buffer for display and does not prevent direct database access. Use it for performance optimization (reducing buffer size) or UX filtering (hiding irrelevant rows). For hard data filtering, enforce rules at the SQL or record level.
