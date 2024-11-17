# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

gtk4_builder_tool = find_program('gtk4-builder-tool')
xsltproc = find_program('xsltproc')

pref_ui_gtk4_files = []

foreach pref_ui_file : pref_ui_files
  fixup = custom_target(
    command: [xsltproc, '-o', '@OUTPUT@', files('3to4-fixup.xsl'), '@INPUT@'],
    input: pref_ui_file,
    output: fs.stem(pref_ui_file) + '.fixup.ui',
  )

  out_file = custom_target(
    command: [
      output_capture,
      gtk4_builder_tool,
      'simplify',
      '--3to4',
      '@INPUT@',
    ],
    input: fixup,
    output: fs.name(pref_ui_file),
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
