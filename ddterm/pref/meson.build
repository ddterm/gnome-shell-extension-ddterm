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

pref_copy_files = []

foreach pref_file : pref_files
  pref_copy_files += fs.copyfile(
    pref_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
endforeach

pack += pref_copy_files

subdir('ui')
subdir('test')
