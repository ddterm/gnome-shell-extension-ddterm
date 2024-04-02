import base64
import enum

import pytest
import pytest_html.extras
import wand.api
import wand.image
import Xlib.X


class StorageType(enum.IntEnum):
    UndefinedPixel = 0
    CharPixel = enum.auto()
    DoublePixel = enum.auto()
    FloatPixel = enum.auto()
    LongPixel = enum.auto()
    LongLongPixel = enum.auto()
    QuantumPixel = enum.auto()
    ShortPixel = enum.auto()


def screenshot(display, format='png'):
    screen = display.screen()
    window = screen.root
    geometry = window.get_geometry()

    image = window.get_image(
        x=0,
        y=0,
        width=geometry.width,
        height=geometry.height,
        format=Xlib.X.ZPixmap,
        plane_mask=0xffffffff
    )

    with wand.image.Image(
        width=geometry.width,
        height=geometry.height,
        depth=8
    ) as wand_image:
        wand_image.alpha_channel = 'off'

        if display.display.info.image_byte_order == 0:
            pixel_format = 'BGRP'
        else:
            pixel_format = 'RGBP'

        wand.api.library.MagickImportImagePixels(
            wand_image.wand,
            0,
            0,
            geometry.width,
            geometry.height,
            pixel_format.encode('ascii'),
            StorageType.CharPixel,
            image.data
        )

        return wand_image.make_blob(format)


class Screenshoter:
    def __init__(self, display, only_on_failure):
        self.display = display
        self.only_on_failure = only_on_failure

    @pytest.hookimpl(wrapper=True)
    def pytest_runtest_makereport(self, item, call):
        report = yield

        if report.when != "call":
            return report

        if self.only_on_failure and not report.failed:
            return report

        png_blob = screenshot(self.display)

        extra = getattr(report, 'extra', [])

        extra.append(
            pytest_html.extras.png(base64.b64encode(png_blob).decode('ascii'))
        )

        report.extra = extra

        return report


def pytest_addoption(parser):
    parser.addoption(
        '--screenshot-failing-only',
        default=False,
        action='store_true',
        help='capture screenshots only for failing tests'
    )


class ScreenCap:
    def __init__(self, pytestconfig):
        self.config = pytestconfig
        self.plugin = None

    def enable(self, display):
        if self.plugin:
            if self.plugin.display != display:
                raise RuntimeError('Already enabled for a different display')
            else:
                return self.plugin

        self.plugin = Screenshoter(
            display=display,
            only_on_failure=self.config.getoption('--screenshot-failing-only')
        )

        self.config.pluginmanager.register(self.plugin)
        return self.plugin

    def disable(self):
        if not self.plugin:
            return

        self.config.pluginmanager.unregister(self.plugin)
        self.plugin = None


@pytest.fixture
def screencap(pytestconfig):
    cap = ScreenCap(pytestconfig)
    yield cap
    cap.disable()
