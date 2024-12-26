# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_gtk4_fixup_files = []

foreach pref_ui_file : pref_ui_files
  pref_ui_gtk4_fixup_files += custom_target(
    command: [xsltproc, '-o', '@OUTPUT@', files('3to4-fixup.xsl'), '@INPUT@'],
    input: pref_ui_file,
    output: '@PLAINNAME@',
  )
endforeach
