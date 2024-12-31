# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

shell_js_out_files = []
shell_js_src_files = files(
  'animation.js',
  'appcontrol.js',
  'dbusapi.js',
  'extension.js',
  'geometry.js',
  'install.js',
  'notifications.js',
  'packagemanager.js',
  'panelicon.js',
  'sd_journal.js',
  'service.js',
  'subprocess.js',
  'windowmatch.js',
  'wlclipboard.js',
  'wm.js',
)

foreach shell_js_src_file : shell_js_src_files
  if get_option('esm')
    shell_js_out_files += fs.copyfile(
      shell_js_src_file,
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  else
    shell_js_out_files += custom_target(
      command: [gjs_translate_esm_command, '-d', meson.project_source_root()],
      input: shell_js_src_file,
      output: '@PLAINNAME@',
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  endif
endforeach

shell_js_out_files += fs.copyfile(
  get_option('esm') ? 'compat.js' : 'compat.legacy.js',
  'compat.js',
  install: true,
  install_dir: extension_dir / 'ddterm' / 'shell',
)

pack += shell_js_out_files
eslint_out += shell_js_out_files
