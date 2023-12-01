shell_files = files(
  'appcontrol.js',
  'dbusapi.js',
  'extension.js',
  'geometry.js',
  'install.js',
  'notifications.js',
  'packagekit.js',
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
  pack += fs.copyfile(
    shell_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'shell',
  )
endforeach
