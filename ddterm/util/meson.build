# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

util_files = files('displayconfig.js')

foreach util_file : util_files
  built_js += fs.copyfile(
    util_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endforeach
