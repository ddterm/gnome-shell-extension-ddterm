<!--
SPDX-FileCopyrightText: 2026 ddterm contributors <https://github.com/ddterm/gnome-shell-extension-ddterm/>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Global shortcuts

In Preferences, under Window → Behavior, enable **Focus before hiding** to
focus a visible, unfocused terminal instead of hiding it. Keep your existing
Toggle shortcut (for example, F1) under Global Shortcuts.

The option is disabled by default. **Show/Activate Terminal Window** remains
an independent shortcut with its existing behavior. Assign different keys to
the two actions.

| Terminal state | Option off | Option on | Show/Activate |
| --- | --- | --- | --- |
| Hidden | Show and focus | Show and focus | Show and focus |
| Visible, unfocused | Hide | Focus | Focus |
| Visible, focused | Hide | Hide | Keep visible and focused |

Changes to the option take effect immediately. It applies only to the global
Toggle shortcut; panel controls and the command-line toggle keep their existing
behavior. Reset the option using its own Reset to default button.
Reset All Shortcuts to Defaults leaves this behavior setting unchanged.

**Hide When Application Loses Focus** continues to work independently. Disable
it if you want the terminal to remain visible when switching to another app.

Hiding the terminal still removes it from the Alt+Tab list. To switch to a
visible terminal through Alt+Tab, disable **Above All Windows** and
**Exclude From Overview/Task Bar**.
