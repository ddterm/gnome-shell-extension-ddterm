# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_gtk4_3to4_files = []

foreach pref_ui_fixup_file : pref_ui_gtk4_fixup_files
  pref_ui_gtk4_3to4_files += custom_target(
    command: [
      output_capture,
      gtk4_builder_tool,
      'simplify',
      '--3to4',
      '@INPUT@',
    ],
    input: pref_ui_fixup_file,
    output: '@PLAINNAME@',
  )
endforeach
