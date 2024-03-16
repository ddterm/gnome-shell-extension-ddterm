output_capture = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('capture-stdout.py'), '--output', '@OUTPUT@', '--'
]

sed = find_program('sed')

if get_option('esm')
  preprocess_command = [output_capture, sed, '-f', files('preproc_esm.sin'), '@INPUT@']
else
  preprocess_command = [output_capture, sed, '-f', files('preproc_legacy.sin'), '@INPUT@']
endif

gjs_translate_esm_command = [
  gjs, files('translate-esm.js'), '-o', '@OUTPUT@', '-d', meson.project_build_root(), '@INPUT@'
]

make_zip_command = [
  # https://github.com/mesonbuild/meson/issues/11255
  find_program('makezip.py'), '--output', '@OUTPUT@', '--relative-to', '@OUTDIR@', '--', '@INPUT@'
]
