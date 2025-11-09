# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_js_out_files = []
pref_js_src_files = files(
  'adw.js',
  'animation.js',
  'behavior.js',
  'colors.js',
  'command.js',
  'compatibility.js',
  'dialog.js',
  'panelicon.js',
  'positionsize.js',
  'scrolling.js',
  'shortcuts.js',
  'tabs.js',
  'text.js',
  'util.js',
)

foreach pref_js_src_file : pref_js_src_files
  pref_js_out_files += fs.copyfile(
    pref_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
endforeach

pack += pref_js_out_files

subdir('ui')
subdir('test')
