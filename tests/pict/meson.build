# SPDX-FileCopyrightText: 2026 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

cmake = import('cmake')

pict_cmake_options = cmake.subproject_options()
pict_cmake_options.set_install(false)
pict_cmake_options.add_cmake_defines({'PICT_RUN_TESTS_ENABLED': 'OFF'})

pict_subproject = cmake.subproject(
  'pict',
  options: pict_cmake_options,
  required: get_option('pict'),
)

summary(
  'PICT test case generation',
  pict_subproject.found(),
  bool_yn: true,
  section: 'Tests',
)

if not pict_subproject.found()
  subdir_done()
endif

diff = find_program('diff')

pict_update_targets = []

foreach pict_gen_target : [
  custom_target(
    command: [pict_subproject.target('pict_cli'), '@INPUT@'],
    capture: true,
    input: ['test_maximize_unmaximize.model'],
    output: ['test_maximize_unmaximize.gen'],
  ),
  custom_target(
    command: [pict_subproject.target('pict_cli'), '@INPUT@'],
    capture: true,
    input: ['test_mouse_resize.model'],
    output: ['test_mouse_resize.gen'],
  ),
  custom_target(
    command: [pict_subproject.target('pict_cli'), '@INPUT@'],
    capture: true,
    input: ['test_resize_maximize_unmaximize.model'],
    output: ['test_resize_maximize_unmaximize.gen'],
  ),
  custom_target(
    command: [pict_subproject.target('pict_cli'), '@INPUT@', '/o:3'],
    capture: true,
    input: ['test_show.model'],
    output: ['test_show.gen'],
  ),
]
  pict_update_targets += run_target(
    fs.name(pict_gen_target.full_path()),
    command: [
      'cp',
      pict_gen_target,
      meson.current_source_dir() / fs.name(pict_gen_target.full_path()),
    ],
  )

  test(
    fs.name(pict_gen_target.full_path()),
    diff,
    args: [
      '-u',
      '-s',
      '--color=' + get_option('b_colorout'),
      files(fs.name(pict_gen_target.full_path())),
      pict_gen_target,
    ],
    suite: ['pict'],
  )
endforeach

alias_target('pict', pict_update_targets)
