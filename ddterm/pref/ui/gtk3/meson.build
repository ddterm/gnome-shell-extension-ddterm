pref_ui_gtk3_files = []

foreach pref_ui_file : pref_ui_files
  out_file = custom_target(
    command: [output_capture, gtk3_builder_tool, 'simplify', '@INPUT@'],
    input: pref_ui_file,
    output: '@PLAINNAME@',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref' / 'ui' / 'gtk3',
  )

  test(
    out_file.full_path(),
    gtk3_builder_tool,
    args: ['validate', out_file],
    suite: ['gtk-builder-validate'],
  )

  pref_ui_gtk3_files += out_file
endforeach

pack += pref_ui_gtk3_files
