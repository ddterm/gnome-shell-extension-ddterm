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
  if get_option('esm')
    pref_copy_files += fs.copyfile(
      pref_file,
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  else
    pref_copy_files += custom_target(
      command: gjs_translate_esm,
      input: pref_file,
      output: fs.name(pref_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  endif
endforeach

pref_copy_files += fs.copyfile(
  get_option('esm') ? 'resources.js' : 'resources.legacy.js',
  'resources.js',
  install: true,
  install_dir: extension_dir / 'ddterm' / 'pref',
)

pack += pref_copy_files

subdir('ui')
subdir('test')
