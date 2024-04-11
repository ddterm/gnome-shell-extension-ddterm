gjs_shebang = get_option('shebang_override')

if gjs_shebang == ''
  gjs_shebang = gjs.full_path()
endif

pack += configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm',
  configuration: {
    'GJS_SHEBANG': gjs_shebang,
    'APP_ID': 'com.github.amezin.ddterm',
  },
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

configure_file(
  input: 'launcher.js',
  output: 'com.github.amezin.ddterm.dev',
  configuration: {
    'GJS_SHEBANG': gjs_shebang,
    'APP_ID': 'com.github.amezin.ddterm.dev',
  },
)
