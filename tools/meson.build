# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

make_zip_command = [
  find_program(files('makezip.py')),  # https://github.com/mesonbuild/meson/issues/11255
  '--output',
  '@OUTPUT@',
  '--relative-to',
  '@OUTDIR@',
  '@INPUT@',
]

fix_metadata_command = [
  find_program(files('fixmetadata.py')),  # https://github.com/mesonbuild/meson/issues/11255
  '@INPUT@',
  '@OUTPUT@',
]

# https://github.com/mesonbuild/meson/issues/11255
run_gnome_shell_script = find_program(files('run_nested_shell.py'))

run_gnome_shell_script_common_args = [
  '--gnome-shell',
  gnome_shell,
  '--dbus-daemon',
  dbus_daemon,
  '--gnome-extensions',
  extensions_tool,
  '--bundle',
]

run_gnome_shell_wayland_nested_command = [
  run_gnome_shell_script,
  gnome_shell.version().version_compare('>=49') ? 'wayland-devkit' : 'wayland-nested',
  run_gnome_shell_script_common_args,
]

xephyr = find_program('Xephyr', required: false, disabler: true)

run_gnome_shell_xephyr_x11_command = [
  run_gnome_shell_script,
  'xephyr',
  '--xephyr',
  xephyr,
  run_gnome_shell_script_common_args,
]

heapgraph_module_copy = fs.copyfile('heapgraph.js')
