# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

app_js_out_files = []
app_js_src_files = files(
  'about.js',
  'application.js',
  'appwindow.js',
  'init.js',
  'meta.js',
  'notebook.js',
  'pcre2.js',
  'search.js',
  'tablabel.js',
  'tcgetpgrp.js',
  'terminal.js',
  'terminalpage.js',
  'terminalsettings.js',
  'urldetect.js',
  'urldetect_patterns.js',
)

foreach app_js_src_file : app_js_src_files
  app_js_out_files += fs.copyfile(
    app_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )
endforeach

bundle += app_js_out_files

app_data_src_files = files('style.css')

foreach app_data_src_file : app_data_src_files
  bundle += fs.copyfile(
    app_data_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )
endforeach

fs.copyfile('dev-application.js')
fs.copyfile('dev-appwindow.js')

subdir('icons')
subdir('ui')
