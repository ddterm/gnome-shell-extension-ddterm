# SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_src_files = files(
  'shortcutdialog.ui',
)

foreach pref_ui_src_file : pref_ui_src_files
  pref_ui_out_files += fs.copyfile(
    pref_ui_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'ui' / 'gtk3',
  )
endforeach
