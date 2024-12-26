# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

schema = files(f'@settings_schema@.gschema.xml')

glib_compile_schemas_tool = find_program('glib-compile-schemas')

schemas_compiled = custom_target(
  command: [
    glib_compile_schemas_tool,
    '--strict',
    '--targetdir=@OUTDIR@',
    '@CURRENT_SOURCE_DIR@',
  ],
  input: schema,
  output: 'gschemas.compiled',
  build_by_default: true,
)

if not get_option('esm')
  pack += schemas_compiled

  pack += custom_target(
    command: [xsltproc, '-o', '@OUTPUT@', files('extract-license.xsl'), schema],
    output: 'gschemas.compiled.license',
  )
endif

test(
  fs.parent(schema) / fs.name(schema),
  glib_compile_schemas_tool,
  args: ['--strict', '--dry-run', meson.current_source_dir()],
  suite: ['glib-compile-schemas'],
)

schema_copy = fs.copyfile(schema, install: true, install_dir: schema_dir)

pack += schema_copy

meson.add_install_script(
  glib_compile_schemas_tool,
  schema_dir,
  skip_if_destdir: true,
)
