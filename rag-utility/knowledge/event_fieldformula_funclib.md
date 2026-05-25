# FieldFormula Event — PeopleCode

## What FieldFormula Is

FieldFormula is a legacy event from early PeopleTools versions. In modern PeopleSoft development, FieldFormula is not used for application logic in components. The RowInit and FieldChange events replaced it for initialization and recalculation purposes.

## Why FieldFormula Must Not Be Used in Components

FieldFormula fires in many different contexts and triggers PeopleCode on every field on every row in the component buffer. In a component with large scrolls or many rows, this recursive buffer-wide firing causes serious performance degradation — massive memory overhead and UI lag. A single FieldFormula program can execute hundreds of times per user action without the developer realizing it.

Do not use FieldFormula PeopleCode in your components. Use RowInit for initialization logic and FieldChange for recalculation logic instead.

## The Only Permitted Use — FUNCLIB_ Record Definitions

The one legitimate use of FieldFormula is in FUNCLIB_ (function library) record definitions. By convention, shared PeopleCode functions that need to be callable from multiple events and components are stored in FieldFormula on fields of records whose names begin with FUNCLIB_. These records are never added to a component, so the recursive buffer-wide firing never occurs.

When you need a shared utility function, define it in FieldFormula on a FUNCLIB_ record field and call it from the appropriate event (FieldEdit, FieldChange, SaveEdit, etc.) using a function call reference. Never put the actual business logic directly in FieldFormula on a component record.
