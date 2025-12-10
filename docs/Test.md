<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# ddterm tests

If you're [building ddterm from source], running

    ninja test

or

    meson test

in the build directory will run some basic tests (if necessary dependencies
are installed and detected by `meson` correctly).

[building ddterm from source]: /docs/Build.md

`tox` allows more flexibility and more thorough testing. To see all available
`tox` commands/environments, run `tox list`.

## System requirements

* Python 3

* tox: <https://tox.wiki/>

* PyGObject: <https://pygobject.readthedocs.io/> or its build dependencies.

* If running tests in containers - podman: <https://podman.io/>

## Running

### Download container images

    tox -e images -- pull

### Optional: remove outdated container images

    tox -e images -- prune

Or to do both at the same time:

    tox -e images -- pull --prune

### Run tests

    tox [--sitepackages] -e pytest -- [--package=path] <other-options...>

Before running tests, you need to [build the extension bundle].

[build the extension bundle]: /docs/Build.md

You either have to specify the path to the built bundle:

    --package=path/to/ddterm@amezin.github.com.shell-extension.zip

or run tox from `meson devenv -C build-dir` shell. If not using `meson devenv`
or `--package=...`, run tests against currently installed extension
(not possible with containers).

The path must be relative to the root of the repository (`tox.ini` directory).

Because of `pytest` CLI bugs,
`--package path/to/ddterm@amezin.github.com.shell-extension.zip`
might not work, but
`--package=path/to/ddterm@amezin.github.com.shell-extension.zip` will.

Without `--sitepackages` you'll have to install PyGObject's build dependencies,
and PyGObject will be automatically built from source.

#### Other options

`--container=IMAGE` - run tests using the specified container image `IMAGE`.
Can be repeated multiple times to run tests with multiple images.
`IMAGE` can be full image name, or a service name from [`compose.yaml`].

[`compose.yaml`]: /tests/compose.yaml

`--screenshot-always` - take screenshots after every test. By default,
screenshots are taken only after failures.

To see all available options:

    tox [--sitepackages] -e pytest -- --help

## Reports

Test report is created as `report.html` in the `tests` directory.

You can also request a report in JUnit format by adding `--junitxml=filename`
option.

## What is being tested

* Window management: tests verify that for a specific combination of settings
(window size, position, maximized/unmaximized flag) the window shows at the
correct location and has the correct size. To reduce the number of settings
combinations, [pairwise testing] (using [PICT]) is applied.

* Basic memory leak tests.

Application's UI is (mostly) not covered, you'll have to [test it manually].

[pairwise testing]: https://www.pairwise.org/
[PICT]: https://github.com/microsoft/pict
[test it manually]: /docs/Debug.md
