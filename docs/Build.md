<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
SPDX-FileContributor: Ivan Peshekhonov

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Build ddterm from source

## 1. Obtain the source code

### 1.a) Using `git`

    git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git

### 1.b) Download as archive and unpack

GitHub UI provides multiple options for downloading the source code as a `.zip`
(or, sometimes, `.tar.gz`) archive - for releases, and arbitrary commits.

## 2. Install the necessary dependencies

To build the extension bundle, you should have the following tools installed:

- [Meson build system] - available as a package named `meson` in most
distributions. It automatically pulls in a tool called [`ninja`]
(package `ninja-build`) and Python 3 as dependencies.

[Meson build system]: https://mesonbuild.com/
[`ninja`]: https://ninja-build.org/

- `msgcmp`, `msgmerge`, `xgettext` (`gettext` package)

## 3. Build the bundle

To build the bundle, `cd` into the directory with the source code:

    cd gnome-shell-extension-ddterm

and run the following commands:

    meson setup build-dir
    ninja -C build-dir bundle

After these steps, you should get the bundle file:
`build-dir/ddterm@amezin.github.com.shell-extension.zip`.

> [!TIP]
> Meson puts all built/generated files into a separate directory, in this guide
> it will be `build-dir`.

> [!TIP]
> If the process fails, please double-check that you have all the dependencies
> (2.a) installed.

## 4. Install the bundle

> [!TIP]
> Instead of installing the bundle on your system, you can test it
> in a [virtual machine], or in a [nested (windowed) GNOME Shell].

[virtual machine]: /docs/Vagrant.md
[nested (windowed) GNOME Shell]: /docs/Debug.md

The installation process is described in [Install.md - continue from step 2].

[Install.md - continue from step 2]: /docs/Install.md#2-install-the-bundle

Alternatively, you could use `meson`/`ninja` to install the bundle too.

### 4.1.a) `user-install`

The following command builds the bundle, if necessary, and installs it
inside user's `$HOME` directory (i.e. typical install location for extensions):

    ninja -C build-dir user-install

The extension can be uninstalled using the following command:

    ninja -C build-dir user-install

### 4.1.b) `meson install` or `ninja install`

> [!CAUTION]
> System-wide installation using `sudo meson install`/`sudo ninja install`
> is not recommended. Instead, you should build and install distro-specific
> packages (`.deb`, `.rpm`). `meson install ... --destdir ...` should work fine
> in packaging scripts (RPM `.spec`, `debian/rules`).
> See Arch Linux [`PKGBUILD`] for example.

[`PKGBUILD`]: /PKGBUILD

You may run `meson install` under `sudo` to install the bundle system-wide
(to `/usr/share/gnome-shell/extensions`):

    sudo meson install -C build-dir

Or, the same command with ninja:

    sudo ninja -C build-dir install

Installed files can be removed with the following command:

    sudo ninja -C build-dir uninstall

### 4.2. Restart GNOME Shell

Described in [Install.md - step 3].

[Install.md - step 3]: /docs/Install.md#3-restart-gnome-shell

### 4.3. Enable the extension

You can enable the extension as described in [Install.md - step 4],
or by running:

    ninja -C build-dir enable

[Install.md - step 4]: /docs/Install.md#4-enable-the-extension

> [!TIP]
> It's not necessary to repeat this step after every reinstallation.
> If an extension was already enabled for this user, this step can be skipped.
