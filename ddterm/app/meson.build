app_js_files = files(
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
  'waitstatus.js'
)

app_ui_files = files(
  'menus.ui',
)

foreach app_file : app_js_files + app_ui_files + files('dependencies.json', 'style.css')
  pack += fs.copyfile(
    app_file,
    fs.name(app_file),
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app',
  )
endforeach

app_prefsdialog_file = files(get_option('esm') ? 'prefsdialog.js' : 'prefsdialog.legacy.js')
app_js_files += app_prefsdialog_file

pack += fs.copyfile(
  app_prefsdialog_file,
  'prefsdialog.js',
  install: true,
  install_dir: extension_dir / 'ddterm' / 'app',
)

subdir('icons')

foreach app_ui_file : app_ui_files
  test(
    fs.parent(app_ui_file) / fs.name(app_ui_file),
    gtk3_builder_tool,
    args: ['validate', app_ui_file],
    suite: ['gtk-builder-validate'],
  )
endforeach

if not get_option('esm')
  subdir('fakeext')
endif

fs.copyfile('dev-application.js')
fs.copyfile('dev-appwindow.js')
