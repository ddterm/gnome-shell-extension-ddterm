util_files = files('displayconfig.js')

foreach util_file : util_files
  built_js += fs.copyfile(
    util_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'util',
  )
endforeach
