# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_test_common_files = [
  fs.copyfile('common.js'),
  pref_js_out_files,
  schema_copy,
  schemas_compiled,
]

run_target(
  'pref-gtk3-test',
  command: [gjs, '-m', fs.copyfile('gtk3.js')],
  depends: [pref_test_common_files, pref_ui_gtk3_out_files],
)

run_target(
  'pref-gtk4-test',
  command: [gjs, '-m', fs.copyfile('gtk4.js')],
  depends: [pref_test_common_files, pref_ui_gtk4_out_files],
)

run_target(
  'pref-adw-test',
  command: [gjs, '-m', fs.copyfile('adw.js')],
  depends: [pref_test_common_files, pref_ui_gtk4_out_files],
)
