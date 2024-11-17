# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_files = files(
  'adw.js',
  'animation.js',
  'behavior.js',
  'colors.js',
  'command.js',
  'compatibility.js',
  'panelicon.js',
  'positionsize.js',
  'scrolling.js',
  'shortcuts.js',
  'tabs.js',
  'text.js',
  'widget.js',
)

pref_built_js = []

foreach pref_file : pref_files
  if get_option('esm')
    pref_built_js += fs.copyfile(
      pref_file,
      fs.name(pref_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  else
    pref_built_js += custom_target(
      command: [gjs_translate_esm_command, '-d', meson.project_source_root()],
      input: pref_file,
      output: fs.name(pref_file),
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  endif
endforeach

if get_option('esm')
  pref_base_uri = '${import.meta.url}'
else
  pref_base_uri = '${imports.misc.extensionUtils.getCurrentExtension().dir.get_uri()}/ddterm/pref/'
endif

pref_util_configured = configure_file(
  input: 'util.js',
  output: 'util.conf.js',
  configuration: {'PREF_BASE_URI': pref_base_uri},
)

if get_option('esm')
  pref_built_js += fs.copyfile(
    pref_util_configured,
    'util.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
else
  pref_built_js += custom_target(
    command: [gjs_translate_esm_command, '-d', meson.project_build_root()],
    input: pref_util_configured,
    output: 'util.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
endif

pref_files += files('util.js')
built_js += pref_built_js

subdir('ui')
subdir('test')
