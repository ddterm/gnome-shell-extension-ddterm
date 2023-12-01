pack += configure_file(
  input: 'com.github.amezin.ddterm.in',
  output: '@BASENAME@',
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
