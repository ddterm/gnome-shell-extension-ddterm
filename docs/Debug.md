<!--
SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Testing/debugging ddterm manually

## Virtual machines/Vagrant

See [`Vagrant.md`].

[`Vagrant.md`]: /docs/Vagrant.md

## Nested Shell

It's possible to run a windowed instance of GNOME Shell with ddterm,
without installing ddterm on your main system.

A helper script [`tools/run_nested_shell.py`] launches GNOME Shell
in a window ("nested" mode), in an isolated (temporary) environment.
It also installs the extension bundle into that environment automatically.

For GNOME 49 and later:

    tools/run_nested_shell.py wayland-devkit

For GNOME 48 and earlier:

    tools/run_nested_shell.py wayland-nested

[`tools/run_nested_shell.py`]: /tools/run_nested_shell.py

This helper script allows testing changes quickly and easily, without breaking
the host system and without restarting the host shell.

> [!NOTE]
> The nested shell has some limitations - for example, it doesn't capture global
> shortcuts, so it may be necessary to configure non-default ddterm toggle
> shortcut on the host.

The script tries to find a prebuilt extension bundle automatically:

- First `EXTENSION_BUNDLE` environment variable is checked. It will be set
automatically by `meson devenv`.

- If the environment variable is not set, it searches for
a `*.shell-extension.zip` file in the current working directory
and its subdirectories.

- You can select which extension bundle to install by passing `--bundle`
argument:

      tools/run_nested_shell.py wayland-devkit --bundle build-dir/ddterm@amezin.github.com.shell-extension.zip

> [!TIP]
> If you [build ddterm from source], `nested-wayland-shell` build target
> automatically runs [`tools/run_nested_shell.py`] after building the bundle.
> So if you modified ddterm source code, and now you want to test it,
> you can simply run:
>
>     ninja -C build-dir nested-wayland-shell
>
> The correct `--bundle` argument will be automatically set by the build system.
> Also, it will choose between `wayland-devkit` and `wayland-nested`
> automatically, based on GNOME Shell version.

[build ddterm from source]: /docs/Build.md

> [!TIP]
> By default, the window is rather small. Its size can be controlled by setting
> [`MUTTER_DEBUG_DUMMY_MODE_SPECS`] environment variable. For example:
>
>     MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 tools/run_nested_shell.py wayland-nested

[`MUTTER_DEBUG_DUMMY_MODE_SPECS`]: https://gitlab.gnome.org/GNOME/mutter/-/blob/cdf969a18f4d4d0f16cbd4bab5a11fc186d33ef8/src/backends/meta-monitor-manager-dummy.c#L398-403

> [!TIP]
> For other options, see:
>
>     tools/run_nested_shell.py wayland-devkit --help
>     tools/run_nested_shell.py wayland-nested --help
>     tools/run_nested_shell.py --help

## Logs

Nested shell outputs all logs to the terminal from which it was started.

When installed to the main shell, ddterm outputs all logs to the same location
as the shell itself:

- `journalctl --user` on systemd-based operating systems

- `~/.cache/gdm/session.log` otherwise
