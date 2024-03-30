npm_tool = find_program('npm', required: false, disabler: true)
npm_command = [npm_tool, '-C', meson.project_source_root()]

npm_install_stamp = meson.current_build_dir() / 'npm-install.stamp'
npm_env = {'DDTERM_POST_INSTALL_STAMP': npm_install_stamp}
meson.add_devenv(npm_env)

npm_install = custom_target(
  command: [npm_command, 'install'],
  output: fs.name(npm_install_stamp),
  depend_files: files(
    meson.project_source_root() / 'package.json',
    meson.project_source_root() / 'package-lock.json'
  ),
  console: true,
  env: npm_env,
)

if meson.version().version_compare('>=1.3.0')
  build_root_relative = fs.relative_to(
    meson.project_build_root(),
    meson.project_source_root(),
  )
else
  build_root_relative = run_command(
    'python3',
    '-c',
    'import os.path; import sys; print(os.path.relpath(*sys.argv[1:]))',
    meson.project_build_root(),
    meson.project_source_root(),
    capture: true,
    check: true,
  ).stdout().strip()
endif

eslint_extra_args = ['--ignore-pattern', build_root_relative]

run_target(
  'eslint',
  command: [npm_command, 'run-script', '--', 'lint', eslint_extra_args],
  depends: npm_install,
)

run_target(
  'eslint-fix',
  command: [npm_command, 'run-script', '--', 'lint:fix', eslint_extra_args],
  depends: npm_install,
)

test(
  'lint-source',
  npm_tool,
  args: ['run-script', '--', 'lint', eslint_extra_args],
  depends: npm_install,
  workdir: meson.project_source_root(),
  suite: ['eslint'],
)

configure_file(
  input: get_option('esm') ? 'eslintrc-ddterm-build-esm.yml.in' : 'eslintrc-ddterm-build-legacy.yml.in',
  output: '.eslintrc.yml',
  configuration: {
    'common_eslintrc': meson.current_source_dir() / 'eslintrc-ddterm-common.yml'
  },
)

test(
  'lint-build',
  npm_tool,
  args: ['exec', '--', 'eslint', build_root_relative, '--resolve-plugins-relative-to', '.'],
  depends: [npm_install, built_js],
  workdir: meson.project_source_root(),
  suite: ['eslint'],
)
