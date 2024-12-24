# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_gtk4_3to4_files = []

foreach pref_ui_fixup_file : pref_ui_gtk4_fixup_files
  out_file = custom_target(
    command: [
      output_capture,
      gtk4_builder_tool,
      'simplify',
      '--3to4',
      '@INPUT@',
    ],
    input: pref_ui_fixup_file,
    output: fs.name(pref_ui_fixup_file.full_path()),
  )

  extracted_license = custom_target(
    command: [
      xml_license_tool,
      'extract',
      '--output',
      '@OUTPUT@',
      '--',
      '@INPUT@',
    ],
    input: pref_ui_fixup_file,
    output: fs.name(pref_ui_fixup_file.full_path()) + '.license',
  )

  pref_ui_gtk4_3to4_files += [[out_file, extracted_license]]
endforeach
