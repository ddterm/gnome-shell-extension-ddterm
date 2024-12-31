# SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

pytest_tool = find_program(
  'pytest',
  dirs: toxworkdir / 'py3' / 'bin',
  required: false,
  disabler: true,
)

pytest_tests = [
  'test_app.py',
  'test_wm.py::TestX11',
  'test_wm.py::TestWayland',
  #'test_wm.py::TestWaylandTwoMonitors',  # Slow and flaky
]

foreach item : pytest_tests
  test(
    item.replace('::', '/'),
    pytest_tool,
    args: [
      '-c',
      files('pytest.ini'),
      '-p',
      'no:cacheprovider',
      '--package=' + pack_target.full_path(),
      '--gjs=' + gjs.full_path(),
      '--gnome-extensions-tool=' + extensions_tool.full_path(),
      '--gnome-shell=' + gnome_shell.full_path(),
      '--xvfb=' + xvfb.full_path(),
      '--gsettings-tool=' + gsettings.full_path(),
      meson.current_source_dir() / item,
    ],
    workdir: meson.current_build_dir(),
    suite: ['pytest'],
    protocol: 'gtest',
    priority: -1,
    timeout: 5 * 60,
  )
endforeach
