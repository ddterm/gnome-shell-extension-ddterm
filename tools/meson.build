output_capture = [
# https://github.com/mesonbuild/meson/issues/11255
  find_program('capture-stdout.py'),
  '--output',
  '@OUTPUT@',
  '--',
]

gjs_translate_esm_command = [
  gjs,
  files('translate-esm.js'),
  '-o',
  '@OUTPUT@',
  '@INPUT@',
]

make_zip_command = [
# https://github.com/mesonbuild/meson/issues/11255
  find_program('makezip.py'),
  '--output',
  '@OUTPUT@',
  '--relative-to',
  '@OUTDIR@',
  '--',
  '@INPUT@',
]

run_gnome_shell_script = find_program('run_nested_shell.py')

run_gnome_shell_script_common_args = [
  '--gnome-shell',
  find_program('gnome-shell', required: devtools_required, disabler: true),
  '--dbus-daemon',
  find_program('dbus-daemon', required: devtools_required, disabler: true),
  '--gnome-extensions',
  find_program('gnome-extensions', required: devtools_required, disabler: true),
  '--pack',
]

run_gnome_shell_wayland_nested_command = [
  run_gnome_shell_script,
  'wayland-nested',
  run_gnome_shell_script_common_args,
]

run_gnome_shell_xephyr_x11_command = [
  run_gnome_shell_script,
  'xephyr',
  '--xephyr',
  find_program('Xephyr', required: devtools_required, disabler: true),
  run_gnome_shell_script_common_args,
]
