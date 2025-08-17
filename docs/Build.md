<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
SPDX-FileContributor: 2023 Ivan Peshekhonov

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Build ddterm from source

## 1. Obtain the source code

### 1.a) Using `git`

    git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git

### 1.b) Download as archive and unpack

GitHub UI provides multiple options for downloading the source code as a `.zip`
(or, sometimes, `.tar.gz`) archive - for releases, and arbitrary commits.

## 2. Set up the build environment

### 2.a) Install the necessary dependencies

To build the extension package, you should have the following tools installed:

- [Meson build system] - available as a package named `meson` in most
distributions. It automatically pulls in a tool called [`ninja`]
(package `ninja-build`) and Python 3 as dependencies.

[Meson build system]: https://mesonbuild.com/
[`ninja`]: https://ninja-build.org/

- `gtk-builder-tool` (`libgtk-3-bin` package on Ubuntu, `gtk3-devel` on Fedora,
`gtk3` package on Arch)

- `gtk4-builder-tool` (`libgtk-4-bin` package on Ubuntu, `gtk4-devel` package
on Fedora, `gtk4` package on Arch)

- `xsltproc` (`xsltproc` package on Ubuntu, `libxslt` on Fedora and Arch)

- `msgcmp`, `msgmerge`, `xgettext` (`gettext` package)

### 2.b) Build in a container

Alternatively, you can use `docker` or `podman` to perform build steps in a
container - the same image/environment that's used by the CI system. To do it,
run build commands with `./do-in-docker.sh` or `./do-in-podman.sh` wrapper:

    ./do-in-docker.sh meson setup build-dir

## 3. Build the package

To build the package, `cd` into the directory with the source code:

    cd gnome-shell-extension-ddterm

and run the following commands:

    meson setup build-dir
    ninja -C build-dir pack

After these steps, you should have the package:
`build-dir/ddterm@amezin.github.com.shell-extension.zip`.

> [!TIP]
> Meson puts all built/generated files into a separate directory, in this guide
> it will be `build-dir`.

> [!TIP]
> If the process fails, please double-check that you have all the dependencies
> (2.a) installed.

> [!NOTE]
> If you want to perform the build in a docker/podman container, prepend
> `./do-in-docker.sh`/`./do-in-podman.sh` to the commands:
>
>     ./do-in-docker.sh meson setup build-dir
>     ./do-in-docker.sh ninja -C build-dir pack

## 4. Install the package

> [!TIP]
> Instead of installing the package on your system, you can test it in a
> [nested (windowed) GNOME Shell], or in a [virtual machine].

[nested (windowed) GNOME Shell]: /docs/Debug.md
[virtual machine]: /docs/Vagrant.md

The installation process is described in [INSTALL.md - continue from step 2].

[INSTALL.md - continue from step 2]: /docs/INSTALL.md#2-install-the-package

Alternatively, you could use `meson`/`ninja` to install the package too -
but only if you didn't use containers to perform the build.

### 4.1.a) `user-install`

The following command builds the package, if necessary, and installs it
inside user's `$HOME` directory (i.e. typical install location for extensions):

    ninja -C build-dir user-install

The extension can be uninstalled using the following command:

    ninja -C build-dir user-install

> [!IMPORTANT]
> You should never run `ninja user-install` with `./run-in-docker.sh` or
> `./run-in-podman.sh`. If the build system was configured for the container,
> installation to the host system through `ninja user-install` will not work.

### 4.1.b) `meson install` or `ninja install`

> [!CAUTION]
> System-wide installation using `sudo meson install`/`sudo ninja install`
> is not recommended. Instead, you should build and install distro-specific
> packages (`.deb`, `.rpm`). `meson install ... --destdir ...` should work fine
> in packaging scripts (RPM `.spec`, `debian/rules`).
> See Arch Linux [`PKGBUILD`] for example.

[`PKGBUILD`]: /PKGBUILD

> [!IMPORTANT]
> You should never run `meson install` with `./run-in-docker.sh` or
> `./run-in-podman.sh`. If the build system was configured for the container,
> installation to the host system through `meson install` will not work.

You may run `meson install` under `sudo` to install the package system-wide
(to `/usr/share/gnome-shell/extensions`):

    sudo meson install -C build-dir

Or, the same command with ninja:

    sudo ninja -C build-dir install

Installed files can be removed with the following command:

    sudo ninja -C build-dir uninstall

### 4.2. Restart GNOME Shell

Described in [INSTALL.md - step 3].

[INSTALL.md - step 3]: /docs/INSTALL.md#3-restart-gnome-shell

### 4.3. Enable the extension

You can enable the extension as described in [INSTALL.md - step 4],
or by running:

    ninja -C build-dir enable

[INSTALL.md - step 4]: /docs/INSTALL.md#4-enable-the-extension

> [!TIP]
> It's not necessary to repeat this step after every reinstallation.
> If an extension was already enabled for this user, this step can be skipped.
