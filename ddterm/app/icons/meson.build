icon_files = files(
  'quotation-symbolic.svg',
  'regex-symbolic.svg',
  'uppercase-symbolic.svg',
)

foreach icon_file : icon_files
  pack += fs.copyfile(
    icon_file,
    install: true,
    install_dir: extension_dir / 'ddterm' / 'app' / 'icons',
  )
endforeach
