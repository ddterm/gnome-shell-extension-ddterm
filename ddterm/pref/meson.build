pref_files = files(
  'adw.js',
  'animation.js',
  'behavior.js',
  'colors.js',
  'command.js',
  'compatibility.js',
  'panelicon.js',
  'positionsize.js',
  'scrolling.js',
  'shortcuts.js',
  'tabs.js',
  'text.js',
  'util.js',
  'widget.js',
)

pref_built_js = []

foreach pref_file : pref_files
  pref_built_js += fs.copyfile(
    pref_file,
    fs.name(pref_file),
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
endforeach

built_js += pref_built_js

subdir('ui')
subdir('test')
