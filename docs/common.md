ddterm Reactive/Rx Utilities
----------------------------

In the process of removal.

Modules in the [`ddterm/rx`] directory are imported by the [application].

They are never imported by the shell extension.

* [`rxutil.js`] is an integration layer between GObject/Gtk and RxJS.

* [`settings.js`] wraps `Gio.Settings` in a collection of RxJS Observables,
and also adds some application-specific settings logic.

* [`timers.js`] is a backport of `setTimeout()`/`setInterval()` for older GJS
versions (required by RxJS for correct error reporting and avoiding warnings).

[`ddterm/rx`]: /ddterm/rx
[application]: /ddterm/app
[`rxutil.js`]: /ddterm/rx/rxutil.js
[`settings.js`]: /ddterm/rx/settings.js
[`timers.js`]: /ddterm/rx/timers.js
