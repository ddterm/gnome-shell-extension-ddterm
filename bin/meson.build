launcher_config = configuration_data()

if get_option('shebang_override') != ''
  launcher_config.set('GJS_SHEBANG', get_option('shebang_override'))
else
  launcher_config.set('GJS_SHEBANG', gjs.full_path())
endif

pack += configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm',
  configuration: launcher_config,
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
