output_capture = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('capture-stdout.py'), '--output', '@OUTPUT@', '--'
]

sed = find_program('sed')

if get_option('esm')
  preprocess_command = [output_capture, sed, '-f', files('preproc_esm.sin'), '@INPUT@']
else
  preprocess_command = [output_capture, sed, '-f', files('preproc_legacy.sin'), '@INPUT@']
endif

gjs_translate_esm_command = [
  gjs, files('translate-esm.js'), '-o', '@OUTPUT@', '-d', meson.project_build_root(), '@INPUT@'
]

make_zip_command = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('makezip.py'), '--output', '@OUTPUT@', '--relative-to', '@OUTDIR@', '--', '@INPUT@'
]

run_gnome_shell_script = find_program('run_nested_shell.py')

run_gnome_shell_script_common_args = [
  '--gnome-shell',
  find_program('gnome-shell', required: false, disabler: true),
  '--dbus-daemon',
  find_program('dbus-daemon', required: false, disabler: true),
  '--gnome-extensions',
  find_program('gnome-extensions', required: false, disabler: true),
  '--pack',
]

run_gnome_shell_wayland_nested_command = [
  run_gnome_shell_script, 'wayland-nested', run_gnome_shell_script_common_args,
]

run_gnome_shell_xephyr_x11_command = [
  run_gnome_shell_script,
  'xephyr',
  '--xephyr',
  find_program('Xephyr', required: false, disabler: true),
  run_gnome_shell_script_common_args,
]
