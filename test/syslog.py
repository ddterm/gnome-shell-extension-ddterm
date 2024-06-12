import contextlib
import datetime
import enum
import logging
import re
import socketserver
import threading

import pytest


@enum.unique
class Severity(enum.IntEnum):
    LOG_EMERG = 0
    LOG_ALERT = 1
    LOG_CRIT = 2
    LOG_ERR = 3
    LOG_WARNING = 4
    LOG_NOTICE = 5
    LOG_INFO = 6
    LOG_DEBUG = 7


@enum.unique
class Facility(enum.IntEnum):
    LOG_KERN = 0
    LOG_USER = 1
    LOG_MAIL = 2
    LOG_DAEMON = 3
    LOG_AUTH = 4
    LOG_SYSLOG = 5
    LOG_LPR = 6
    LOG_NEWS = 7
    LOG_UUCP = 8
    LOG_CRON = 9
    LOG_AUTHPRIV = 10
    LOG_FTP = 11
    LOG_NTP = 12
    LOG_SECURITY = 13
    LOG_CONSOLE = 14
    LOG_SOLCRON = 15

    LOG_LOCAL0 = 16
    LOG_LOCAL1 = 17
    LOG_LOCAL2 = 18
    LOG_LOCAL3 = 19
    LOG_LOCAL4 = 20
    LOG_LOCAL5 = 21
    LOG_LOCAL6 = 22
    LOG_LOCAL7 = 23


LOGGER = logging.getLogger(__name__)

LOGGERS = {
    facility.value: LOGGER.getChild(facility.name.removeprefix('LOG_'))
    for facility in Facility
}

PRI_FALLBACK = Facility.LOG_USER << 3 | Severity.LOG_ERR

LEVELS = {
    Severity.LOG_EMERG: logging.CRITICAL + 2,
    Severity.LOG_ALERT: logging.CRITICAL + 1,
    Severity.LOG_CRIT: logging.CRITICAL,
    Severity.LOG_ERR: logging.ERROR,
    Severity.LOG_WARNING: logging.WARNING,
    Severity.LOG_NOTICE: logging.INFO + 5,
    Severity.LOG_INFO: logging.INFO,
    Severity.LOG_DEBUG: logging.DEBUG,
}

logging.addLevelName(LEVELS[Severity.LOG_NOTICE], 'NOTICE')
logging.addLevelName(LEVELS[Severity.LOG_ALERT], 'ALERT')
logging.addLevelName(LEVELS[Severity.LOG_EMERG], 'EMERG')

MONTHS = [
    b'Jan',
    b'Feb',
    b'Mar',
    b'Apr',
    b'May',
    b'Jun',
    b'Jul',
    b'Aug',
    b'Sep',
    b'Oct',
    b'Nov',
    b'Dec',
]

PATTERN_MONTH = b'(?P<month>' + b'|'.join(MONTHS) + b')'
PATTERN_DAY = rb'(?P<day> \d|\d\d)'
PATTERN_TIME = rb'(?P<time>\d\d:\d\d:\d\d)'
PATTERN_TIMESTAMP = b' '.join((PATTERN_MONTH, PATTERN_DAY, PATTERN_TIME))

PATTERN_PRI = rb'<(?P<pri>\d{1,3})>'

PATTERN_PROC = rb'(?:(?P<processName>[^: ]*?)(?:\[(?P<pid>\d+)\]): )?'

PATTERN_MSG = b'(?P<msg>' + PATTERN_PROC + b'.*)'

PATTERN = re.compile(
    b''.join((
        PATTERN_PRI,
        b'(?:' + PATTERN_TIMESTAMP + b' )?',
        PATTERN_MSG,
    )),
    re.ASCII | re.DOTALL
)


def parse(message):
    parsed = PATTERN.fullmatch(message)
    data = {}

    if parsed:
        pri = int(parsed['pri'])
        msg = parsed['msg'].decode(errors='backslashreplace')

        if created := parsed['time']:
            month = MONTHS.index(parsed['month']) + 1
            day = int(parsed['day'])

            createdtime = datetime.datetime.combine(
                datetime.date.today().replace(day=day, month=month),
                datetime.time.fromisoformat(created.decode()),
            )

            data['created'] = createdtime.timestamp()
            data['msecs'] = 0

        if process_name := parsed['processName']:
            data['processName'] = process_name.decode(errors='backslashreplace')
        else:
            data['processName'] = None

        if pid := parsed['pid']:
            data['process'] = int(pid)
        else:
            data['process'] = None

    else:
        pri = PRI_FALLBACK
        msg = message.decode(errors='backslashreplace')

    logger = LOGGERS.get(pri >> 3, LOGGER)
    data['name'] = logger.name

    syslog_levelno = pri & 0b111

    data['levelno'] = LEVELS.get(syslog_levelno, logging.ERROR)
    data['levelname'] = Severity(syslog_levelno).name.removeprefix('LOG_')

    data['msg'] = msg
    data['message'] = msg

    return data, logger


class SyslogHandler(socketserver.BaseRequestHandler):
    def handle(self):
        data, _ = self.request
        record, logger = parse(data)
        logger.handle(logging.makeLogRecord(record))


class SyslogServer(socketserver.UnixDatagramServer):
    def __init__(self, address):
        super().__init__(address, SyslogHandler)

    @property
    def logger(self):
        return LOGGER

    @contextlib.contextmanager
    def serve_forever_background(self, *args, **kwargs):
        thread = threading.Thread(target=self.serve_forever, args=args, kwargs=kwargs)
        thread.start()

        try:
            yield self

        finally:
            self.shutdown()
            thread.join()


@pytest.fixture(scope='session')
def syslog_server(tmp_path_factory):
    path = tmp_path_factory.mktemp('syslog') / 'socket'

    with SyslogServer(str(path)) as server:
        with server.serve_forever_background(poll_interval=0.1):
            yield server
