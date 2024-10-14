import collections
import contextlib
import fcntl
import inspect
import logging
import os
import pathlib
import subprocess

import pytest
import yaml

from . import procutil


pytest_plugins = ('screenshot', 'syslog', 'logsync')

LOGGER = logging.getLogger(__name__)

THIS_FILE = pathlib.Path(__file__).resolve()
THIS_DIR = THIS_FILE.parent
SRC_DIR = THIS_DIR.parent
COMPOSE_FILE = THIS_DIR / 'compose.yaml'

IMAGES_STASH_KEY = pytest.StashKey[list]()


def pytest_addoption(parser):
    parser.addoption(
        '--container',
        action='append',
        default=[],
        help='run tests using the specified container image. '
             'Can be repeated multiple times to run tests with multiple images.'
    )

    parser.addoption(
        '--journald',
        action='store_true',
        default=False,
        help='Redirect GNOME Shell output to journald (only in containers).'
    )

    parser.addoption(
        '--hw-accel',
        action='store_true',
        default=False,
        help='Allow hardware acceleration.'
    )

    package_from_env = os.getenv('DDTERM_BUILT_PACK')

    parser.addoption(
        '--package',
        default=pathlib.Path(package_from_env) if package_from_env else None,
        required=False,
        type=pathlib.Path,
        help='ddterm extension package to test (ddterm@amezin.github.com.shell-extension.zip). '
             'Will test the currently installed extension if not specified. '
             'Must be specified for containers.',
    )


def pytest_configure(config):
    if images := config.option.container:
        if not config.option.package:
            raise pytest.UsageError('If --container is specified, --package must be specified too')

        with open(COMPOSE_FILE) as f:
            compose = yaml.safe_load(f)

        aliases = dict()
        by_profile = collections.defaultdict(set)

        for service_name, service_config in compose['services'].items():
            image = service_config['image']
            aliases[service_name] = image

            for profile in service_config.get('profiles', []):
                by_profile[profile].add(image)

        resolved = set()

        for image in images:
            profile = by_profile.get(image, None)
            alias = aliases.get(image, None)

            if not profile and not alias:
                resolved.add(image)
                continue

            if profile:
                resolved.update(profile)

            if alias:
                resolved.add(alias)

        config.stash[IMAGES_STASH_KEY] = resolved


class FdLock:
    def __init__(self, fd):
        self.fd = fd
        self.count = 0

    def __enter__(self):
        if self.count == 0:
            fcntl.flock(self.fd, fcntl.LOCK_EX)

        self.count += 1

        return self

    def __exit__(self, *_):
        self.count -= 1

        if self.count == 0:
            fcntl.flock(self.fd, fcntl.LOCK_UN)


@pytest.fixture(scope='session')
def container_lock(request):
    lock_path = request.config.cache.mkdir('containers') / 'lock'
    fd = os.open(lock_path, os.O_RDWR | os.O_TRUNC | os.O_CREAT, 0o644)

    try:
        yield FdLock(fd)

    finally:
        os.close(fd)


@pytest.fixture(scope='session')
def container(tmp_path_factory, container_lock, request):
    if hasattr(request, 'param'):
        image = request.param

    elif images := request.config.stash.get(IMAGES_STASH_KEY, None):
        (image,) = images

    else:
        yield None
        return

    syslog_server = request.getfixturevalue('syslog_server')

    create_cmd = [
        'podman',
        '--runtime=crun',
        'container',
        'create',
        '--log-driver=none',
        '--tty',
        '--cap-add=SYS_ADMIN,SYS_NICE,SYS_PTRACE,SETPCAP,NET_RAW,NET_BIND_SERVICE,IPC_LOCK',
        '--security-opt=label=disable',
        '--userns=keep-id',
        '--user=0',
        '--cgroupns=private',
        f'--volume={SRC_DIR}:{SRC_DIR}:ro',
        f'--volume={os.getcwd()}:{os.getcwd()}:ro',
        f'--volume={tmp_path_factory.getbasetemp()}:{tmp_path_factory.getbasetemp()}',
        f'--volume={syslog_server.server_address}:/run/systemd/journal/syslog',
    ]

    if package := request.config.option.package:
        package = pathlib.Path(package).resolve()
        create_cmd.append(f'--volume={package}:{package}:ro')

    if request.config.option.hw_accel:
        create_cmd.append('--device=/dev/dri/:/dev/dri/:rwm')
        create_cmd.append('--group-add=keep-groups')

    create_cmd.extend([
        image,
        '/sbin/init',
        'systemd.journald.forward_to_syslog=1',
        'systemd.journald.forward_to_console=0',
    ])

    launcher = procutil.Launcher()

    with contextlib.ExitStack() as stack:
        with container_lock:
            cid = launcher.run(
                *create_cmd,
                timeout=None,
                stdout=subprocess.PIPE,
            ).stdout.decode().rstrip()

            LOGGER.info('Created container %r', cid)

            console_stack = stack.enter_context(contextlib.ExitStack())

            def shutdown():
                with container_lock:
                    launcher.run(
                        'podman',
                        'container',
                        'rm',
                        '--force',
                        '--volumes',
                        f'--time={procutil.DEFAULT_SHUTDOWN_TIMEOUT}',
                        cid,
                        timeout=procutil.DEFAULT_SHUTDOWN_TIMEOUT * 2,
                    )

            stack.callback(shutdown)

            console_stack.enter_context(launcher.spawn(
                'podman',
                '--runtime=crun',
                'container',
                'start',
                '--attach',
                '--sig-proxy=false',
                cid,
            ))

            exit_code = '0'
            attempts = 0

            while attempts < 2 and exit_code == '0':
                exit_code = launcher.run(
                    'podman',
                    '--runtime=crun',
                    'container',
                    'wait',
                    '--condition=running',
                    # interrupt wait if container fails
                    '--condition=exited',
                    '--condition=stopped',
                    cid,
                    stdout=subprocess.PIPE
                ).stdout.decode().strip()

                attempts += 1

            assert exit_code == '-1'

            container_launcher = procutil.ContainerExecLauncher(container_id=cid, user=0)

            container_launcher.run(
                'busctl',
                '--watch-bind=1',
                f'--timeout={procutil.DEFAULT_TIMEOUT // 2}',
                'status',
                timeout=procutil.DEFAULT_TIMEOUT,
            )

            container_launcher.run('systemctl', 'is-system-running', '--wait')

        yield cid


@pytest.fixture(scope='session')
def process_launcher(container):
    if container is None:
        return procutil.Launcher()

    return procutil.ContainerExecLauncher(
        container_id=container,
        user=os.getuid(),
    )


@pytest.fixture(scope='session')
def os_id(process_launcher):
    return process_launcher.run(
        'sh',
        '-c',
        '. /etc/os-release && echo $ID',
        stdout=subprocess.PIPE
    ).stdout.rstrip().decode()


def pytest_generate_tests(metafunc):
    if 'container' in metafunc.fixturenames:
        images = metafunc.config.stash.get(IMAGES_STASH_KEY, None)

        if images and len(images) > 1:
            metafunc.parametrize('container', images, indirect=True, scope='session')


def pytest_pycollect_makeitem(collector, name, obj):
    if not inspect.isclass(obj):
        return None

    if not collector.istestclass(obj, name):
        return None

    if not hasattr(obj, 'pytest_pycollect_makeitem'):
        return None

    return obj().pytest_pycollect_makeitem(collector=collector, name=name, obj=obj)
