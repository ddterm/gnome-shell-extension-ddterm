ddterm Reactive/Rx Utilities
----------------------------

Modules in the [`ddterm/rx`] directory are imported by both the [application]
and [Preferences dialog].

However, they are never imported by the extension itself.

Because this component is used by the [Preferences dialog] code, it must also
support both Gtk 3 and Gtk 4.

* [`rxutil.js`] is an integration layer between GObject/Gtk and RxJS.

* [`settings.js`] wraps `Gio.Settings` in a collection of RxJS Observables,
and also adds some application-specific settings logic.

* [`timers.js`] is a backport of `setTimeout()`/`setInterval()` for older GJS
versions (required by RxJS for correct error reporting and avoiding warnings).

[`ddterm/rx`]: /ddterm/rx

[application]: /ddterm/app
[Preferences dialog]: /ddterm/pref

[`rxutil.js`]: /ddterm/rx/rxutil.js
[`settings.js`]: /ddterm/rx/settings.js
[`timers.js`]: /ddterm/rx/timers.js
