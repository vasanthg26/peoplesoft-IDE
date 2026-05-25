# SavePostChange SQL Rules — PeopleCode

## Purpose of SavePostChange

SavePostChange fires after the Component Processor has updated the database with the component data — all SQL INSERTs, UPDATEs, and DELETEs have already been issued. The system issues a SQL COMMIT after SavePostChange PeopleCode completes successfully. Use SavePostChange for processing that must happen after the database update, such as updating tables that are not part of the component buffer using SQLExec.

## Critical SQL Rule — Never Issue COMMIT or ROLLBACK Manually

Never issue a SQL COMMIT or ROLLBACK manually from within a SQLExec function in SavePostChange (or any component event). Let the Component Processor issue these SQL commands. Manually committing or rolling back inside a component event breaks the Component Processor's transaction management and can result in partial saves, data corruption, or unpredictable behavior.

## Error and Warning Are Prohibited

An Error or Warning statement in SavePostChange PeopleCode causes a runtime error that forces the end-user to cancel the component without saving changes. By this point the database has already been updated, so this leaves data in an inconsistent state. All validation must be completed in SaveEdit or SavePreChange before reaching SavePostChange.

## Correct Use Pattern

Use SavePostChange only for post-commit side effects: writing to audit tables not in the component buffer, calling external systems via SQLExec, or triggering downstream processes that depend on the committed data. Keep SavePostChange logic minimal and free of validation, errors, warnings, and manual transaction control.
