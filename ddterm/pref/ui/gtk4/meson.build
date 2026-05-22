# SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

foreach pref_ui_src_file : pref_ui_src_files
  pref_ui_out_files += custom_target(
    command: [xsltproc, '-o', '@OUTPUT@', files('3to4.xsl'), '@INPUT@'],
    input: pref_ui_src_file,
    output: '@PLAINNAME@',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'ui' / 'gtk4',
  )
endforeach
