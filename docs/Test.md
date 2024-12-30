<!--
SPDX-FileCopyrightText: 2022 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-3.0-or-later
-->

# ddterm tests

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

    tox [--sitepackages] -- [--package=path] <other-options...>

Before running tests, you need to [build the extension package](/docs/BUILD.md).

You either have to specify:

    --package=path/to/built/ddterm@amezin.github.com.shell-extension.zip

or run tox from `meson devenv -C build-dir` shell. If not using `meson devenv`
or `--package=...`, run tests against currently installed extension
(not possible with containers).

Without `--sitepackages` you'll have to install PyGObject's build dependencies,
and PyGObject will be automatically built from source by `tox`.

#### Other options

`--container=IMAGE` - run tests using the specified container image `IMAGE`.
Can be repeated multiple times to run tests with multiple images.
`IMAGE` can be full image name, or a service name from [`compose.yaml`].
Also, `esm` or `legacy` can be passed as `IMAGE` - in this case, all images
with the matching profile will be selected.

`--screenshot-always` - take screenshots after every test. By default,
screenshots are taken only after failures.

To see all available options:

    tox [--sitepackages] -- --help

## Report

Test report is created as `report.html` in the `test` directory.

You could also request a report in JUnit format by adding
`--junitxml=filename` option.

## What is being tested

* Window management: tests verify that for a specific combination of settings
(window size, position, maximized/unmaximized flag) the window shows at the
correct location and has the correct size. To reduce the number of settings
combinations, [pairwise testing] (using [PICT]) is applied.

* Basic memory leak tests.

Application's UI is (mostly) not covered.

[pairwise testing]: https://www.pairwise.org/
[PICT]: https://github.com/microsoft/pict
[`compose.yaml`]: /test/compose.yaml
