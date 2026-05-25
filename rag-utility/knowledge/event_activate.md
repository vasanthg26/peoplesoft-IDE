# Activate Event — PeopleCode

## Purpose and When to Use Activate

The Activate event fires each time a page gets activated — both during initial component load and whenever the user navigates to that page within the component. Each page has its own Activate event, making it the right place for page-specific logic that should run every time the page is displayed.

Activate PeopleCode can only be associated with pages. It is not valid for subpages — only pages defined as Standard or Secondary support this event.

## Common Activate Patterns

Security and display control: use Activate to enforce page-level security, such as making all fields on a page display-only for certain users or roles. This is the standard pattern for controlling what a specific user can see or edit on a page without hiding the page entirely.

Conditional field enabling: check a user's role or a component variable in Activate and enable or disable specific fields or scrolls accordingly.

Page-specific initialization: any initialization logic that applies to one page but not others belongs in Activate rather than PostBuild. PostBuild fires once for the whole component; Activate fires each time that specific page is shown.

## Activate vs PreBuild vs PostBuild

PreBuild fires before the component builds and is used to hide or unhide entire pages or set component-level variables. PostBuild fires after all component build events complete and is also used for component-wide initialization. Activate fires per-page on each activation and is used for page-level display control and security. Use Activate when the logic is specific to one page and should re-execute whenever the user returns to that page.
