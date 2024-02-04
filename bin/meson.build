pack += configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm',
  configuration: gjs_config,
  install: true,
  install_dir: extension_dir / 'bin',
  install_mode: 'rwxr-xr-x'
)

launcher_installed = extension_dir / 'bin' / 'com.github.amezin.ddterm'

install_symlink(
  'com.github.amezin.ddterm',
  pointing_to: launcher_installed,
  install_dir: bindir,
)
