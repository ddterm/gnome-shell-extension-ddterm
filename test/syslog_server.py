import contextlib
import enum
import logging
import re
import socketserver
import threading


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
    facility.value: LOGGER.getChild(facility.name) for facility in Facility
}

LEVELS = {
    Severity.LOG_EMERG: logging.CRITICAL,
    Severity.LOG_ALERT: logging.CRITICAL,
    Severity.LOG_CRIT: logging.CRITICAL,
    Severity.LOG_ERR: logging.ERROR,
    Severity.LOG_WARNING: logging.WARNING,
    Severity.LOG_NOTICE: logging.INFO,
    Severity.LOG_INFO: logging.INFO,
    Severity.LOG_DEBUG: logging.DEBUG,
}

PRI_PATTERN = re.compile(r'<(?P<value>\d{1,3})>', re.ASCII)
PRI_FALLBACK = Facility.LOG_USER << 3 | Severity.LOG_ERR


class SyslogHandler(socketserver.BaseRequestHandler):
    def handle(self):
        data, _ = self.request
        message = data.decode()

        pri = PRI_PATTERN.match(message)

        if pri:
            message = message[pri.end():]
            pri = int(pri['value'])
        else:
            pri = PRI_FALLBACK

        logger = LOGGERS.get(pri >> 3, LOGGER)
        level = LEVELS.get(pri & 0b111, logging.ERROR)

        record = logger.makeRecord(
            name=logger.name,
            level=level,
            fn='syslog',
            lno=0,
            msg=message,
            args=None,
            exc_info=None,
        )

        logger.handle(record)


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
