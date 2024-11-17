# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

shell_files = files(
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

foreach shell_file : shell_files
  if get_option('esm')
    built_js += fs.copyfile(
      shell_file,
      fs.name(shell_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  else
    built_js += custom_target(
      command: [gjs_translate_esm_command, '-d', meson.project_source_root()],
      input: shell_file,
      output: fs.name(shell_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  endif
endforeach

shell_compat_file = files(get_option('esm') ? 'compat.js' : 'compat.legacy.js')
shell_files += shell_compat_file

built_js += fs.copyfile(
  shell_compat_file,
  'compat.js',
  install: true,
  install_dir: extension_dir / 'ddterm' / 'shell',
)
