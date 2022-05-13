import atexit
import base64
import collections
import contextlib
import functools
import itertools
import logging
import pathlib
import subprocess
import time

import filelock
import pytest
import wand.image
from pytest_html import extras

from . import container_util, dbus_util


LOGGER = logging.getLogger(__name__)

Rect = collections.namedtuple('Rect', ('x', 'y', 'width', 'height'))
MonitorConfig = collections.namedtuple('MonitorConfig', ['current_index', 'setting'])

TEST_SRC_DIR = pathlib.Path(__file__).parent.resolve()
SRC_DIR = TEST_SRC_DIR.parent
EXTENSION_UUID = 'ddterm@amezin.github.com'
PKG_PATH = f'/home/gnomeshell/.local/share/gnome-shell/extensions/{EXTENSION_UUID}'

MAXIMIZE_MODES = ['not-maximized', 'maximize-early', 'maximize-late']
HORIZONTAL_RESIZE_POSITIONS = ['left', 'right']
VERTICAL_RESIZE_POSITIONS = ['top', 'bottom']
POSITIONS = VERTICAL_RESIZE_POSITIONS + HORIZONTAL_RESIZE_POSITIONS
SIZE_VALUES = [0.5, 0.9, 1.0]


@pytest.fixture(scope='session')
def xvfb_fbdir(tmpdir_factory):
    return tmpdir_factory.mktemp('xvfb')


@pytest.fixture(scope='session')
def global_tmp_path(tmp_path_factory):
    return tmp_path_factory.getbasetemp().parent


@pytest.mark.runtest_cm.with_args(lambda item, when: item.cls.journal_context(item, when))
class CommonTests:
    GNOME_SHELL_SESSION_NAME: str
    N_MONITORS: int
    PRIMARY_MONITOR = 0

    current_container: container_util.Container = None
    current_dbus_connection: 'gi.repository.Gio.DBusConnection' = None
    test_interface_ready = False

    @classmethod
    @contextlib.contextmanager
    def journal_context(cls, item, when):
        assert cls is not CommonTests

        msg = f'Beginning of {item.nodeid} {when}'

        if cls.test_interface_ready:
            dbus_util.call(cls.current_dbus_connection, 'LogMessage', '(s)', msg)
        elif cls.current_container != None:
            cls.current_container.exec('systemd-cat', input=msg.encode())

        try:
            yield

        finally:
            if cls.current_container == None:
                return

            try:
                msg = f'End of {item.nodeid} {when}'
                cls.current_container.console.set_wait_line(msg.encode())

                if cls.test_interface_ready:
                    dbus_util.call(cls.current_dbus_connection, 'LogMessage', '(s)', msg)
                else:
                    cls.current_container.exec('systemd-cat', input=msg.encode())

                cls.current_container.console.wait_line(timeout=1)

            except Exception:
                LOGGER.exception("Can't sync journal")

    @pytest.fixture(scope='class')
    def container(self, podman, container_image, xvfb_fbdir, global_tmp_path, request):
        assert request.cls is not CommonTests
        assert request.cls.current_container is None

        with filelock.FileLock(global_tmp_path / 'container-starting.lock') as lock:
            c = container_util.Container.run(
                podman,
                '--rm', '-P', '--log-driver=none',
                '--cap-add=SYS_NICE,IPC_LOCK,SYS_PTRACE,SETPCAP,NET_RAW,NET_BIND_SERVICE',
                '-v', f'{SRC_DIR}:{PKG_PATH}:ro',
                '-v', f'{TEST_SRC_DIR}/fbdir.conf:/etc/systemd/system/xvfb@.service.d/fbdir.conf:ro',
                '-v', f'{xvfb_fbdir}:/xvfb',
                container_image,
            )
            atexit.register(c.kill)

            try:
                c.start_console()
                request.cls.current_container = c

                c.exec('busctl', '--system', '--watch-bind=true', 'status', stdout=subprocess.DEVNULL)
                c.exec('systemctl', 'is-system-running', '--wait')

                lock.release()

                yield c

            finally:
                request.cls.current_container = None
                c.kill()
                atexit.unregister(c.kill)

    @pytest.fixture(scope='class')
    def user_env(self, container):
        uid = int(container.exec('id', '-u', user='gnomeshell', stdout=subprocess.PIPE).stdout)
        return dict(user='gnomeshell', env=dict(DBUS_SESSION_BUS_ADDRESS=f'unix:path=/run/user/{uid}/bus'))

    @pytest.fixture(scope='class')
    def gnome_shell_session(self, container, user_env):
        container.exec('systemctl', '--user', 'start', f'{self.GNOME_SHELL_SESSION_NAME}@:99', **user_env)
        return self.GNOME_SHELL_SESSION_NAME

    @pytest.fixture(scope='class')
    def bus_connection(self, container, user_env, request):
        assert request.cls is not CommonTests
        assert request.cls.current_dbus_connection is None

        while container.exec(
            'busctl', '--user', '--watch-bind=true', 'status',
            stdout=subprocess.DEVNULL, check=False, **user_env
        ).returncode != 0:
            time.sleep(0.1)

        hostport = container.inspect('{{json .NetworkSettings.Ports}}')['1234/tcp'][0];
        host = hostport['HostIp'] or '127.0.0.1'
        port = hostport['HostPort']

        c = dbus_util.connect_tcp(host, port)
        request.cls.current_dbus_connection = c

        try:
            yield c

        finally:
            c.close()
            assert request.cls.current_dbus_connection is c
            request.cls.current_dbus_connection = None

    @pytest.fixture(scope='class')
    def bus_call(self, bus_connection):
        return functools.partial(dbus_util.call, bus_connection)

    @pytest.fixture(scope='class')
    def bus_get_property(self, bus_connection):
        return functools.partial(dbus_util.get_property, bus_connection)

    @pytest.fixture(scope='class')
    def shell_extensions_interface_ready(self, bus_connection, gnome_shell_session):
        dbus_util.wait_interface(bus_connection, path='/org/gnome/Shell', interface='org.gnome.Shell.Extensions')

    @pytest.fixture(scope='class')
    def extension_enabled(self, bus_call, shell_extensions_interface_ready):
        bus_call('EnableExtension', '(s)', EXTENSION_UUID, path='/org/gnome/Shell', interface='org.gnome.Shell.Extensions')

    @pytest.fixture
    def screenshot(self, xvfb_fbdir, extra, pytestconfig):
        class ScreenshotContextManager(contextlib.AbstractContextManager):
            def __exit__(self, exc_type, exc_value, traceback):
                if exc_type is None and pytestconfig.getoption('--screenshot-failing-only'):
                    return

                xwd_blob = pathlib.Path(xvfb_fbdir / 'Xvfb_screen0').read_bytes()

                with wand.image.Image(blob=xwd_blob, format='xwd') as img:
                    png_blob = img.make_blob('png')

                extra.append(extras.png(base64.b64encode(png_blob).decode('ascii')))

        return ScreenshotContextManager

    @pytest.fixture(scope='class')
    def extension_test_interface_ready(self, bus_connection, extension_enabled, request):
        assert request.cls is not CommonTests
        assert request.cls.test_interface_ready == False

        dbus_util.wait_interface(bus_connection)
        request.cls.test_interface_ready = True

        try:
            yield

        finally:
            request.cls.test_interface_ready = False

    @pytest.fixture(scope='class', autouse=True)
    def extension_setup(self, bus_call, bus_get_property, extension_test_interface_ready):
        assert bus_get_property('PrimaryMonitor') == self.PRIMARY_MONITOR
        assert bus_get_property('NMonitors') == self.N_MONITORS

        bus_call('Setup')

    @pytest.fixture(scope='class')
    def monitors_geometry(self, bus_call, extension_test_interface_ready):
        return [
            Rect(*bus_call('GetMonitorGeometry', '(i)', index, return_type='(iiii)'))
            for index in range(self.N_MONITORS)
        ]

    @pytest.fixture(scope='class')
    def monitors_scale(self, bus_call, extension_test_interface_ready):
        return [
            bus_call('GetMonitorScale', '(i)', index, return_type='(i)')[0]
            for index in range(self.N_MONITORS)
        ]

    @pytest.fixture(scope='class')
    def shell_version(self, bus_get_property, shell_extensions_interface_ready):
        return bus_get_property(
            'ShellVersion',
            path='/org/gnome/Shell',
            interface='org.gnome.Shell'
        )

    @pytest.mark.parametrize('window_size', [0.31, 0.36, 0.4, 0.8, 0.85, 0.91])
    @pytest.mark.parametrize('window_maximize', MAXIMIZE_MODES)
    @pytest.mark.parametrize('window_pos', VERTICAL_RESIZE_POSITIONS)
    def test_show_v(self, bus_call, window_size, window_maximize, window_pos, monitor_config, screenshot):
        with screenshot():
            bus_call('TestShow', '(dssis)', window_size, window_maximize, window_pos, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize('window_size', [0.31, 0.36, 0.4, 0.8, 0.85, 0.91])
    @pytest.mark.parametrize('window_maximize', MAXIMIZE_MODES)
    @pytest.mark.parametrize('window_pos', HORIZONTAL_RESIZE_POSITIONS)
    def test_show_h(self, bus_call, window_size, window_maximize, window_pos, monitor_config, monitors_geometry, monitors_scale, screenshot):
        if monitor_config.setting == 'primary':
            target_monitor = self.PRIMARY_MONITOR
        else:
            target_monitor = monitor_config.current_index

        if monitors_geometry[target_monitor].width * window_size < 472 * monitors_scale[target_monitor]:
            pytest.skip('Screen too small')

        with screenshot():
            bus_call('TestShow', '(dssis)', window_size, window_maximize, window_pos, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize('window_size', SIZE_VALUES)
    @pytest.mark.parametrize('window_maximize', MAXIMIZE_MODES)
    @pytest.mark.parametrize('window_size2', SIZE_VALUES)
    @pytest.mark.parametrize('window_pos', POSITIONS)
    @pytest.mark.flaky
    def test_resize_xte(self, bus_call, window_size, window_maximize, window_size2, window_pos, monitor_config, shell_version, screenshot):
        version_split = tuple(int(x) for x in shell_version.split('.'))
        if version_split < (3, 39):
            if monitor_config.current_index == 1 and window_pos == 'bottom' and window_size2 == 1:
                pytest.skip('For unknown reason it fails to resize to full height on 2nd monitor')

        with screenshot():
            bus_call('TestResizeXte', '(dsdsis)', window_size, window_maximize, window_size2, window_pos, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize('window_size', SIZE_VALUES)
    @pytest.mark.parametrize(('window_pos', 'window_pos2'), (p for p in itertools.product(POSITIONS, repeat=2) if p[0] != p[1]))
    def test_change_position(self, bus_call, window_size, window_pos, window_pos2, monitor_config, screenshot):
        with screenshot():
            bus_call('TestChangePosition', '(dssis)', window_size, window_pos, window_pos2, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize('window_size', SIZE_VALUES)
    @pytest.mark.parametrize('window_maximize', MAXIMIZE_MODES)
    @pytest.mark.parametrize('window_pos', POSITIONS)
    def test_unmaximize(self, bus_call, window_size, window_maximize, window_pos, monitor_config, screenshot):
        with screenshot():
            bus_call('TestUnmaximize', '(dssis)', window_size, window_maximize, window_pos, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize('window_size', SIZE_VALUES)
    @pytest.mark.parametrize('window_size2', SIZE_VALUES)
    @pytest.mark.parametrize('window_pos', POSITIONS)
    def test_unmaximize_correct_size(self, bus_call, window_size, window_size2, window_pos, monitor_config, screenshot):
        with screenshot():
            bus_call('TestUnmaximizeCorrectSize', '(ddsis)', window_size, window_size2, window_pos, monitor_config.current_index, monitor_config.setting)

    @pytest.mark.parametrize(('window_size', 'window_size2'), (p for p in itertools.product(SIZE_VALUES, repeat=2) if p[0] != p[1]))
    @pytest.mark.parametrize('window_pos', POSITIONS)
    def test_unmaximize_on_size_change(self, bus_call, window_size, window_size2, window_pos, monitor_config, screenshot):
        with screenshot():
            bus_call('TestUnmaximizeOnSizeChange', '(ddsis)', window_size, window_size2, window_pos, monitor_config.current_index, monitor_config.setting)


@pytest.mark.parametrize('monitor_config', [
    MonitorConfig(0, 'current')
])
class SingleMonitorTests(CommonTests):
    N_MONITORS = 1


@pytest.mark.parametrize('monitor_config', [
    MonitorConfig(1, 'primary'),
    MonitorConfig(1, 'current'),
    # MonitorConfig(0, 'current'), # not interesting
])
class DualMonitorTests(CommonTests):
    N_MONITORS = 2


class TestXSession(SingleMonitorTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-xsession'


class TestWayland(SingleMonitorTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested'


class TestWaylandHighDpi(SingleMonitorTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested-highdpi'


class TestWaylandDualMonitor(DualMonitorTests):
    GNOME_SHELL_SESSION_NAME = 'gnome-wayland-nested-dual-monitor'
