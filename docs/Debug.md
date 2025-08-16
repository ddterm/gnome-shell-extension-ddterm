<!--
SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Testing/debugging ddterm manually

## Nested Shell

It's possible to run an instance of GNOME Shell with ddterm, without actually
installing ddterm.

A helper script [`run_nested_shell.py`] can launch a nested instance
of GNOME Shell in an isolated (temporary) environment. It can also install
the extension package into that environment automatically.
This allows testing changes quickly and easily, without breaking the host
system and without restarting the host shell.

The nested shell has some limitations - for example, it doesn't capture global
shortcuts, so it may be necessary to configure non-default ddterm toggle
shortcut on the host.

`nested-wayland-shell` build target automatically runs [`run_nested_shell.py`]
after building the package. So to test your code modifications, you can simply
run:

    ninja -C build-dir nested-wayland-shell

[`run_nested_shell.py`]: /tools/run_nested_shell.py

## Virtual machines/Vagrant

See [`Varant.md`](/docs/Vagrant.md).

## Logs

Nested shell outputs all logs to the terminal from which it was started.

If ran from the main shell, ddterm outputs all logs to the same location
as the shell itself:

- `journalctl --user` on systemd-based operating systems

- `~/.cache/gdm/session.log` otherwise
