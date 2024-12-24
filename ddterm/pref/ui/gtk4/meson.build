# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

gtk4_builder_tool = find_program('gtk4-builder-tool')

subdir('fixup')
subdir('3to4')

pref_ui_gtk4_files = []

foreach pref_ui_file_and_license : pref_ui_gtk4_3to4_files
  pref_ui_file = pref_ui_file_and_license[0]
  pref_ui_file_license = pref_ui_file_and_license[1]

  out_file = custom_target(
    command: [
      xml_license_tool,
      'embed',
      '--output',
      '@OUTPUT@',
      '--license',
      pref_ui_file_license,
      '--',
      pref_ui_file,
    ],
    output: fs.name(pref_ui_file.full_path()),
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'ui' / 'gtk4',
  )

  pref_ui_gtk4_files += out_file

  test(
    out_file.full_path(),
    gtk4_builder_tool,
    args: ['validate', out_file],
    suite: ['gtk-builder-validate'],
  )
endforeach

pack += pref_ui_gtk4_files
