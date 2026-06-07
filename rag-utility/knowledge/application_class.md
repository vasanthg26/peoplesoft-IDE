# Application Classes — PeopleCode Object-Oriented Programming

## Purpose and When to Use Application Classes

Application Classes are PeopleSoft's object-oriented programming construct (PeopleTools 8.4+). They let you define reusable, encapsulated logic with properties and methods, organized in Application Packages. Modern PeopleSoft (HCM 9.2+, Campus Solutions, FSCM) uses them heavily for business logic that is shared across components, events, and Application Engine programs.

Use an Application Class when:
- The requirement explicitly asks for a "class", "method", "application package", or "object-oriented" implementation.
- Logic must be reused across multiple events, components, or AE programs (write once, call everywhere).
- You are extending or overriding delivered framework classes (e.g., implementing an interface, extending a base class).
- Complex business logic benefits from encapsulation (state held in properties, behavior in methods).

Do NOT create an Application Class for simple, single-event inline logic (a one-line FieldChange default, a single SaveEdit validation). Inline PeopleCode is correct for surgical, event-local changes. Only introduce a class when reuse or the requirement demands it.

## Application Package Structure

Classes live in an Application Package hierarchy: `PACKAGE:SUBPACKAGE:ClassName`. The package path is how you reference and import a class.

```
PACKAGE_ROOT
  └── SubPackage
        └── ClassName   (the Application Class PeopleCode program)
```

## Anatomy of an Application Class

An Application Class program has two parts: the **class declaration** (interface) and the **method/property implementations**.

```peoplecode
import PKG_BASE:Utilities:*;

class PurchaseOrderValidator
   method PurchaseOrderValidator();                     /* constructor */
   method ValidateTotal(&poTotal as number) Returns boolean;
   property string BusinessUnit;                        /* public read/write property */
   property number LineCount readonly;                  /* read-only property */
private
   method CalcLineSum() Returns number;                 /* private method */
   instance Rowset &rsLines;                            /* private instance variable */
   constant &MAX_LINES = 999;                           /* class constant */
end-class;

/* ---- Implementations below the declaration ---- */

method PurchaseOrderValidator
   /* %This refers to the current instance */
   &rsLines = GetLevel0()(1).GetRowset(Scroll.PO_LINE);
   %This.LineCount = &rsLines.ActiveRowCount;
end-method;

method ValidateTotal
   /+ &poTotal as number +/
   /+ Returns boolean +/
   Local number &sum = %This.CalcLineSum();
   Return (&sum = &poTotal);
end-method;

method CalcLineSum
   /+ Returns number +/
   Local number &total = 0;
   Local integer &i;
   For &i = 1 To &rsLines.ActiveRowCount
      &total = &total + &rsLines(&i).PO_LINE.MERCHANDISE_AMT.Value;
   End-For;
   Return &total;
end-method;
```

## Key Syntax Rules

- **import**: Place `import` statements at the very top. Use `import PKG:SubPkg:ClassName;` for a specific class, or `import PKG:SubPkg:*;` to import all classes in a sub-package. Always import before the `class` declaration.
- **class ... end-class**: The declaration block lists method signatures, properties, and (after `private`) private members. It does NOT contain implementation bodies.
- **method signatures**: Declared in the class block as `method Name(&arg as type) Returns type;`. The implementation appears below the `end-class` as `method Name ... end-method`.
- **Method signature comments**: In the implementation, repeat the signature using `/+ &arg as type +/` and `/+ Returns type +/` annotations — PeopleTools requires these.
- **property**: `property type Name;` is read/write. Add `readonly` for read-only, or `get`/`set` for accessor-backed properties.
- **private**: Everything after the `private` keyword (methods, instance variables) is only accessible inside the class.
- **instance**: `instance type &var;` declares a member variable that persists for the life of the object instance (like a private field).
- **constant**: `constant &NAME = value;` declares a class-level constant.
- **%This**: Refers to the current object instance (like `this`/`self`). Use `%This.Property` and `%This.Method()` to access members.
- **%Super**: Refers to the parent class — used to call the overridden parent method from a subclass.

## Constructors

The constructor is a method with the **same name as the class**. It runs when the object is created with `create`. Use it to initialize instance variables and properties.

## Inheritance: extends and implements

```peoplecode
/* Extend a base class (inherit its members) */
class ExpressPOValidator extends PKG_PO:Validation:PurchaseOrderValidator
   method ValidateTotal(&poTotal as number) Returns boolean;   /* override */
end-class;

method ValidateTotal
   /+ &poTotal as number +/
   /+ Returns boolean +/
   /* Call the parent implementation, then add express-specific logic */
   Local boolean &baseOk = %Super.ValidateTotal(&poTotal);
   Return &baseOk And %This.LineCount <= 50;
end-method;
```

- **extends**: Single inheritance — the subclass inherits all non-private members of the parent. Override a method by re-declaring it with the same signature.
- **implements**: A class can implement an interface (declared with `interface ... end-interface`). It must provide implementations for every method/property the interface declares.
- Use `%Super.MethodName()` to invoke the parent's version of an overridden method.

## Instantiating and Calling a Class from an Event

This is the most common scenario: an event (FieldChange, SaveEdit, etc.) creates an instance of an Application Class and calls its methods. The inline event code stays minimal — the heavy logic lives in the class.

```peoplecode
import PKG_PO:Validation:PurchaseOrderValidator;

/* In SaveEdit on PO_HDR */
Local PKG_PO:Validation:PurchaseOrderValidator &validator;
&validator = create PKG_PO:Validation:PurchaseOrderValidator();
If Not &validator.ValidateTotal(PO_HDR.PO_AMT_TOTAL.Value) Then
   Error MsgGetText(11100, 10, "PO total does not match line distribution total.");
End-If;
```

- **create**: The `create` operator instantiates a class: `create PKG:Sub:ClassName(args)`. It invokes the constructor.
- **Typed declaration**: Declare the object variable with its full package path: `Local PKG:Sub:ClassName &obj;`.
- **CreateObject (legacy/dynamic)**: `CreateObject("PKG:Sub:ClassName", args)` is the older/dynamic form; prefer `create` with a typed variable when the class path is known at compile time.

## App Class vs Inline PeopleCode — Decision Guidance

| Situation | Use |
|---|---|
| Single-event, surgical change (one validation, one default) | Inline PeopleCode in the event |
| Logic reused across many events/components/AE | Application Class |
| Requirement explicitly says "class", "method", "package" | Application Class |
| Extending/overriding delivered framework behavior | Application Class (extends/implements) |
| Existing event already calls a class | Inject into / extend that class, keep event thin |

When modifying an existing event that already instantiates an Application Class, keep the event code thin: call the class method rather than duplicating logic inline. When the requirement is genuinely event-local and not reused, do NOT over-engineer by introducing a class.

## Common Built-in / Framework Classes

- `PT_PAGE_UTILS:*`, `PTPP_*` — page and portal utilities.
- `Exception` — base exception class; `throw create Exception(msgSet, msgNum, ...)` raises a catchable error; use `try ... catch &ex Exception ... end-try` to handle.
- `Rowset`, `Row`, `Record`, `Field` — these are built-in object types (not Application Classes) but are used as method argument/return types and properties.

## Important Restrictions and Best Practices

- Application Class PeopleCode is stored as its own program (Application Package PeopleCode), NOT attached to a record field event. To use it, an event/AE program must `import` and instantiate it.
- The class declaration block must appear before any implementation; imports must appear before the class declaration.
- Private members are not accessible outside the class — do not reference them from calling event code.
- Always declare object variables with the fully-qualified package path for compile-time type safety and method autocomplete.
- Keep constructors lightweight; avoid heavy DB work in a constructor that may run often.
- Prefer `create` over `CreateObject` when the class is known at design time (compile-time checking, better performance).
