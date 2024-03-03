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
  if get_option('esm')
    pref_built_js += custom_target(
      command: preprocess_command,
      input: pref_file,
      output: fs.name(pref_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  else
    preproc = custom_target(
      command: preprocess_command,
      input: pref_file,
      output: fs.name(pref_file) + '.sed',
    )

    pref_built_js += custom_target(
      command: [gjs_translate_esm, '-o', '@OUTPUT@', '-d', meson.project_build_root(), '@INPUT@'],
      input: preproc,
      output: fs.name(pref_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  endif
endforeach

built_js += pref_built_js

subdir('ui')
subdir('test')
