import base64
import logging

import pytest
import pytest_html

from gi.repository import GLib


LOGGER = logging.getLogger(__name__)


class Capture:
    def __init__(self, test_hook, tmp_path):
        self.test_hook = test_hook
        self.tmp_path = tmp_path

    def should_capture(self, report):
        return report.failed

    @pytest.hookimpl(wrapper=True)
    def pytest_runtest_makereport(self, item, call):
        report = yield

        if not self.should_capture(report):
            return report

        file_path = self.tmp_path / 'screenshot.png'

        try:
            self.test_hook.Screenshot(file_path)

        except GLib.Error:
            LOGGER.exception('Cannot take screenshot')
            return report

        png_blob = file_path.read_bytes()
        extra = getattr(report, 'extra', [])

        extra.append(
            pytest_html.extras.png(base64.b64encode(png_blob).decode('ascii'))
        )

        report.extra = extra

        return report


class CaptureAlways(Capture):
    def should_capture(self, report):
        if report.when == 'call' and not report.skipped:
            return True

        return super().should_capture(report)


@pytest.fixture
def screenshot(shell_test_hook, pytestconfig, tmp_path):
    if pytestconfig.getoption('--screenshot-always'):
        capture = CaptureAlways(test_hook=shell_test_hook, tmp_path=tmp_path)
    else:
        capture = Capture(test_hook=shell_test_hook, tmp_path=tmp_path)

    pytestconfig.pluginmanager.register(capture)

    yield capture

    pytestconfig.pluginmanager.unregister(capture)


def pytest_addoption(parser):
    parser.addoption(
        '--screenshot-always',
        default=False,
        action='store_true',
        help='Capture screenshots for all tests'
    )
