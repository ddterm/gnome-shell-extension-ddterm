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
  'panelicon.js',
  'sd_journal.js',
  'service.js',
  'subprocess.js',
  'windowmatch.js',
  'wlclipboard.js',
  'wm.js',
)

foreach shell_js_src_file : shell_js_src_files
  shell_js_out_files += fs.copyfile(
    shell_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'shell',
  )
endforeach

pack += shell_js_out_files
