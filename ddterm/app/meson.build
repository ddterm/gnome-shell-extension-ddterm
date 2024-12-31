# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

app_js_out_files = []
app_js_src_files = files(
  'accellabel.js',
  'application.js',
  'appwindow.js',
  'dependencies.js',
  'extensiondbus.js',
  'gtktheme.js',
  'init.js',
  'meta.js',
  'notebook.js',
  'pcre2.js',
  'resources.js',
  'search.js',
  'settings.js',
  'tablabel.js',
  'tcgetpgrp.js',
  'terminal.js',
  'terminalpage.js',
  'terminalsettings.js',
  'urldetect.js',
  'urldetect_patterns.js',
  'waitstatus.js',
)

foreach app_js_src_file : app_js_src_files
  app_js_out_files += fs.copyfile(
    app_js_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )
endforeach

if get_option('esm')
  app_prefsdialog_src_file = files('prefsdialog.js')
else
  app_prefsdialog_src_file = files('prefsdialog.legacy.js')

  subdir('fakeext')
endif

app_js_src_files += app_prefsdialog_src_file
app_js_out_files += fs.copyfile(
  app_prefsdialog_src_file,
  'prefsdialog.js',
  install: true,
  install_dir: extension_dir / 'ddterm' / 'app',
)

pack += app_js_out_files
eslint_out += app_js_out_files

app_ui_src_files = files('menus.ui')

foreach app_ui_src_file : app_ui_src_files
  pack += fs.copyfile(
    app_ui_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )

  test(
    fs.relative_to(app_ui_src_file, meson.project_source_root()),
    gtk3_builder_tool,
    args: ['validate', app_ui_src_file],
    suite: ['gtk-builder-validate'],
  )
endforeach

app_data_src_files = files(
  'dependencies.json',
  'dependencies.json.license',
  'style.css',
)

foreach app_data_src_file : app_data_src_files
  pack += fs.copyfile(
    app_data_src_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )
endforeach

eslint_out += fs.copyfile('dev-application.js')
eslint_out += fs.copyfile('dev-appwindow.js')

subdir('icons')
