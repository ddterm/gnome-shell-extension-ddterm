# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

app_ui_src_files = files(
  'menus.ui',
  'search.ui',
)

foreach app_ui_src_file : app_ui_src_files
  bundle += fs.copyfile(
    app_ui_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app' / 'ui',
  )
endforeach
