pref_test_common_files = [
  fs.copyfile('common.js'),
  pref_built_js,
  schema_copy,
  schemas_compiled,
]

run_target(
  'pref-gtk3-test',
  command: [gjs, '-m', fs.copyfile('gtk3.js')],
  depends: [pref_test_common_files, pref_ui_gtk3_files],
)

run_target(
  'pref-gtk4-test',
  command: [gjs, '-m', fs.copyfile('gtk4.js')],
  depends: [pref_test_common_files, pref_ui_gtk4_files],
)

run_target(
  'pref-adw-test',
  command: [gjs, '-m', fs.copyfile('adw.js')],
  depends: [pref_test_common_files, pref_ui_gtk4_files],
)

configure_file(
  input: 'eslintrc-build.yml.in',
  output: '.eslintrc.yml',
  configuration: {
    # https://github.com/mesonbuild/meson/issues/12792
    'DONT_EMIT_MESON_WARNING': 'YES',
  },
)
