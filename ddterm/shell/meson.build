shell_files = files(
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
    built_js += custom_target(
      command: preprocess_command,
      input: shell_file,
      output: fs.name(shell_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  else
    preproc = custom_target(
      command: preprocess_command,
      input: shell_file,
      output: fs.name(shell_file) + '.sed',
    )

    built_js += custom_target(
      command: [
        gjs_translate_esm_command,
        '-r', 'resource:///org/gnome/shell/extensions/extension.js:Me.imports.ddterm.shell.compat',
      ],
      input: preproc,
      output: fs.name(shell_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'shell',
    )
  endif
endforeach

if not get_option('esm')
  built_js += fs.copyfile(
    'compat.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'shell',
  )
endif
