if get_option('esm')
  built_js += fs.copyfile(
    'displayconfig.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
else
  built_js += custom_target(
    command: gjs_translate_esm_command,
    input: 'displayconfig.js',
    output: 'displayconfig.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endif
