# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

subdir('fixup')
subdir('3to4')

pref_ui_gtk4_files = []

foreach i : range(pref_ui_files.length())
  out_file = custom_target(
    command: [
      xsltproc,
      '-o',
      '@OUTPUT@',
      '--stringparam',
      'sourceFile',
      pref_ui_gtk4_fixup_files[i].full_path(),
      files('copy-license.xsl'),
      '@INPUT@',
    ],
    input: pref_ui_gtk4_3to4_files[i],
    output: '@PLAINNAME@',
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
