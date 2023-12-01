pref_test_common_files = [
  fs.copyfile('common.js'),
  pref_copy_files,
  schema_copy,
  schemas_compiled,
]

run_target(
  'pref-gtk3-test',
  command: [gjs, '-m', fs.copyfile('gtk3.js')],
  depends: [pref_test_common_files, pref_ui_gtk3_files]
)

run_target(
  'pref-gtk4-test',
  command: [gjs, '-m', fs.copyfile('gtk4.js')],
  depends: [pref_test_common_files, pref_ui_gtk4_files]
)
