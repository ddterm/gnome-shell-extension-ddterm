# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

subdir('fixup')

gtk4_builder_tool = find_program('gtk4-builder-tool')

pref_ui_gtk4_files = []

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
