# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pref_js_out_files = []
pref_js_src_files = files(
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

foreach pref_js_src_file : pref_js_src_files
  if get_option('esm')
    pref_js_out_files += fs.copyfile(
      pref_js_src_file,
      install: true,
      install_dir: extension_dir / 'ddterm' / 'pref',
    )
  else
    pref_js_out_files += custom_target(
      command: [gjs_translate_esm_command, '-d', meson.project_source_root()],
      input: pref_js_src_file,
      output: '@PLAINNAME@',
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

pref_util_conf_file = configure_file(
  input: 'util.js',
  output: 'util.conf.js',
  configuration: {'PREF_BASE_URI': pref_base_uri},
)

if get_option('esm')
  pref_js_out_files += fs.copyfile(
    pref_util_conf_file,
    'util.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
else
  pref_js_out_files += custom_target(
    command: [gjs_translate_esm_command, '-d', meson.project_build_root()],
    input: pref_util_conf_file,
    output: 'util.js',
    install: true,
    install_dir: extension_dir / 'ddterm' / 'pref',
  )
endif

pack += pref_js_out_files
eslint_out += pref_js_out_files

subdir('ui')
subdir('test')
