<!--
SPDX-FileCopyrightText: 2023 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Command line

You can open a new tab from the command line:

    $ com.github.amezin.ddterm -- ssh localhost

See `com.github.amezin.ddterm --help` for options.

You'll need to add
`~/.local/share/gnome-shell/extensions/ddterm@amezin.github.com/bin` to `PATH`.

## `gapplication`

You could also interact with ddterm through `gapplication` utility:

    $ gapplication action com.github.amezin.ddterm show
    $ gapplication action com.github.amezin.ddterm hide
    $ gapplication action com.github.amezin.ddterm toggle

Open a new tab with the specified working directory:

    $ gapplication launch com.github.amezin.ddterm ~/directory

Or launch a script:

    $ gapplication launch com.github.amezin.ddterm ~/script.sh

## Extension's D-Bus interface

As an alternative to `gapplication`, it's possible to toggle the terminal
through ddterm extension's D-Bus interface.

    $ gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.Toggle

Or simply show/activate:

    $ gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ddterm --method com.github.amezin.ddterm.Extension.Activate
