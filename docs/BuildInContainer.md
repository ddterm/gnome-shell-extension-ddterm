<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>
SPDX-FileContributor: 2023 Ivan Peshekhonov

SPDX-License-Identifier: GPL-3.0-or-later
-->

# Build ddterm from source, using CI container image

## 1. Obtain the source code

### 1.a) Using `git`

    git clone https://github.com/ddterm/gnome-shell-extension-ddterm.git

### 1.b) Download as archive and unpack

GitHub UI provides multiple options for downloading the source code as a `.zip`
(or, sometimes, `.tar.gz`) archive - for releases, and arbitrary commits.

## 2. Build the package

To build the package, `cd` into the directory with the source code:

    cd gnome-shell-extension-ddterm

and run the same commands, as in a [normal build from source (step 3)],
but prefixed with `./do-in-docker.sh` (to use a Docker container):

    ./do-in-docker.sh meson setup '-Dshebang_override=/usr/bin/env gjs' build-dir
    ./do-in-docker.sh ninja -C build-dir pack

or with `./do-in-podman.sh` (to use a Podman container):

    ./do-in-podman.sh meson setup '-Dshebang_override=/usr/bin/env gjs' build-dir
    ./do-in-podman.sh ninja -C build-dir pack

[normal build from source (step 3)]: /docs/Build.md#3-build-the-package

> [!IMPORTANT]
> When running `meson setup` or `meson configure` in the container, you have
> to pass `'-Dshebang_override=/usr/bin/env gjs'` as an argument, because
> there is no `gjs` in the container image. And even if it was there, `gjs`
> on the host system, where you will run ddterm, can be located at a different
> path.

> [!TIP]
> `'-Dshebang_override=...'` option configures ddterm to use the specified
> `gjs` executable. `/usr/bin/env gjs` will search for the exectuable in
> `PATH`. But the option can also be set to the full path to the executable.
> If the option is not set, the build system will try to find the executable
> at build time.

After these steps, you should get the package file:
`build-dir/ddterm@amezin.github.com.shell-extension.zip`.

## 4. Install the package

> [!TIP]
> Instead of installing the package on your system, you can test it
> in a [virtual machine], or in a [nested (windowed) GNOME Shell].

[virtual machine]: /docs/Vagrant.md
[nested (windowed) GNOME Shell]: /docs/Debug.md

The installation process is described in [Install.md - continue from step 2].

[Install.md - continue from step 2]: /docs/Install.md#2-install-the-package

> [!IMPORTANT]
> You should never run `meson install` or `ninja user-install`
> after building the package under `./do-in-docker.sh` or `./do-in-podman.sh`.
> If the build system was configured for the container,
> `meson install` or `ninja user-install` may not work correctly on the host system.
