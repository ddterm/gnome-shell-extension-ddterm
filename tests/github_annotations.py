# SPDX-FileCopyrightText: 2025 Aleksandr Mezin <mezin.alexander@gmail.com>
#
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import warnings


try:
    from xdist import is_xdist_worker

except ImportError:
    def is_xdist_worker(request_or_session):
        return hasattr(request_or_session.config, 'workerinput')


def escape_message(message):
    return message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def escape_property(value):
    return escape_message(str(value)).replace(':', '%3A').replace(',', '%2C')


def command(command, message='', **properties):
    properties = ','.join(
        f'{k}={escape_property(v)}'
        for k, v in properties.items()
    )

    if properties:
        return f'::{command} {properties}::{escape_message(message)}'
    else:
        return f'::{command}::{escape_message(message)}'


class FailureReporter:
    def __init__(self, terminal_reporter):
        self.terminal_reporter = terminal_reporter

    def pytest_runtest_logreport(self, report):
        if not report.failed:
            return

        filesystempath, lineno, _ = report.location

        properties = dict(
            title=report.nodeid,
            file=filesystempath,
        )

        if lineno is not None:
            properties['line'] = lineno + 1

        self.terminal_reporter.write_line(command('error', report.longreprtext, **properties))


class WarningReporter:
    def __init__(self, terminal_reporter):
        self.terminal_reporter = terminal_reporter

    def pytest_warning_recorded(self, warning_message, when, nodeid, location):
        properties = dict(title=nodeid)

        if location:
            filename, linenumber, _ = location
        else:
            filename = warning_message.filename
            linenumber = warning_message.lineno

        if filename:
            properties['file'] = filename

        if linenumber is not None:
            properties['line'] = linenumber + 1

        warning_message = warnings.formatwarning(
            warning_message.message,
            warning_message.category,
            warning_message.filename,
            warning_message.lineno,
            warning_message.line,
        )

        self.terminal_reporter.write_line(command('warning', warning_message, **properties))


def pytest_addoption(parser):
    env_value = os.environ.get('GITHUB_ACTIONS', None)

    parser.addoption(
        '--github-actions-annotations',
        type=bool,
        default=env_value == 'true',
        help='Generate GitHub Actions annotations for failures and warnings',
    )


def pytest_sessionstart(session):
    if not session.config.option.github_actions_annotations:
        return

    if is_xdist_worker(session):
        return

    terminal_reporter = session.config.pluginmanager.getplugin('terminalreporter')

    session.config.pluginmanager.register(FailureReporter(terminal_reporter))
    session.config.pluginmanager.register(WarningReporter(terminal_reporter))
