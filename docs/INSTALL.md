<!--
SPDX-FileCopyrightText: 2021 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# [extensions.gnome.org]

The easiest way to install the extension is to go to [extensions.gnome.org].

However, the review process on [extensions.gnome.org] is sometimes slow.
A new release may be available here on GitHub, but not on
[extensions.gnome.org] yet.

[extensions.gnome.org]: https://extensions.gnome.org/extension/3780/ddterm/

# Install OS package

## Arch Linux

### [AUR]

Package is available in [AUR].

[AUR]: https://aur.archlinux.org/packages/gnome-shell-extension-ddterm

### Binary repository

Binary packages are also available: <https://github.com/ddterm/aur>

To use the repository, append the following section to `/etc/pacman.conf`:

    [ddterm]
    SigLevel = Never
    Server = https://ddterm.github.io/aur

# Install from GNOME Shell extension package

You can also install the extension from a `.zip` package.

## 1. Obtain the package

You could either download an already-built package or build it from the source
code yourself.

### 1.a) Prebuilt package

You can download a released version from
[Releases](https://github.com/ddterm/gnome-shell-extension-ddterm/releases)
page. You need the file `ddterm@amezin.github.com.shell-extension.zip`.

Also, the CI system builds a package for every commit. Latest package for the
`master` branch is published here:

<https://ddterm.github.io/gnome-shell-extension-ddterm/ddterm@amezin.github.com.shell-extension.zip>

[!WARNING] If you install the package from the `master` branch, GNOME Shell
will not update it automatically when a new version is released.

### 1.b) Build from source code

See [BUILD.md](BUILD.md) for build instructions.

## 2. Install the package

After downloading or building the package, run the following command to install
it:

    gnome-extensions install -f /path/to/ddterm@amezin.github.com.shell-extension.zip

## 3. Restart GNOME Shell

To detect the newly installed or upgraded extension, GNOME Shell usually needs
to be restarted.

On Wayland, the only way is to restart your session - log out, then login back.

On X11 you can restart the shell without logging out by pressing
<kbd>Alt+F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd>.

## 4. Enable the extension

After GNOME Shell had been restarted, you can enable the extension using
the `gnome-tweaks` app, or by running:

    gnome-extensions enable ddterm@amezin.github.com

You'll have to perform this step only once.
