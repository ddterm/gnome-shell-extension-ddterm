# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_ui_gtk3_out_files = []

foreach pref_ui_src_file : pref_ui_src_files
  pref_ui_gtk3_out_file = custom_target(
    command: [output_capture, gtk3_builder_tool, 'simplify', '@INPUT@'],
    input: pref_ui_src_file,
    output: '@PLAINNAME@',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'ui' / 'gtk3',
  )

  test(
    fs.relative_to(
      pref_ui_gtk3_out_file.full_path(),
      meson.project_source_root(),
    ),
    gtk3_builder_tool,
    args: ['validate', pref_ui_gtk3_out_file],
    suite: ['gtk-builder-validate'],
  )

  pref_ui_gtk3_out_files += pref_ui_gtk3_out_file
endforeach

pack += pref_ui_gtk3_out_files
