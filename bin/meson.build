# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

launcher = configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm',
  configuration: {
    'GJS_SHEBANG': gjs_shebang,
    'APP_ID': 'com.github.amezin.ddterm',
    'APP_MODULE': '../ddterm/app/application.js',
  },
  install: true,
  install_dir: extension_dir / 'bin',
  install_mode: 'rwxr-xr-x',
)

launcher_installed = extension_dir / 'bin' / 'com.github.amezin.ddterm'

install_symlink(
  'com.github.amezin.ddterm',
  pointing_to: launcher_installed,
  install_dir: bindir,
)

dev_launcher = configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm.dev',
  configuration: {
    'GJS_SHEBANG': gjs_shebang,
    'APP_ID': 'com.github.amezin.ddterm.dev',
    'APP_MODULE': '../ddterm/app/dev-application.js',
  },
)
