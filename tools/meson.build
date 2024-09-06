output_capture = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('capture-stdout.py'), '--output', '@OUTPUT@', '--'
]

make_zip_command = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('makezip.py'), '--output', '@OUTPUT@', '--relative-to', '@OUTDIR@', '--', '@INPUT@'
]
