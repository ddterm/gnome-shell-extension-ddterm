import contextlib
import datetime
import logging
import re
import select
import threading


LOGGER = logging.getLogger(__name__)
LOGGER_UNPARSED = LOGGER.getChild('unparsed')

GLIB_MESSAGE_RE = re.compile(
    rb'^(?:\*\* )?'
    rb'(?:\((?P<prgname>.*?):(?P<pid>\d+)\): )?'
    rb'(?:(?P<domain>.*?)-)?'
    rb'(?:\033\[1;3\dm)?'
    rb'(?P<levelname>ERROR|CRITICAL|WARNING|Message|INFO|DEBUG|LOG|LOG-(?P<level_hex>0x[a-f\d]+))'
    rb'(?:\033\[0m)?'
    rb'(?: \(recursed\))?'
    rb'(?: \*\*)?'
    rb': '
    rb'(?:\033\[34m)?'
    rb'(?:\(error\)|(?P<created>\d\d:\d\d:\d\d))\.(?P<msecs>\d{3})'
    rb'(?:\033\[0m)?'
    rb': '
    rb'(?P<message>.*(?:(?:\n\nStack trace:)?(?:(?:\n.*@.*:\d+:\d+)+|(?:\n\d+ .* \[\".*\":\d+:\d+\])+)\n {0,2})?)$',  # noqa: E501
    re.ASCII | re.MULTILINE
)


logging.addLevelName(logging.INFO + 1, 'LOG')
logging.addLevelName(logging.INFO + 2, 'Message')


def parse(match):
    data = {}

    if message := match['message']:
        message = message.decode(errors='backslashreplace')
    else:
        message = ''

    data['message'] = message
    data['msg'] = message

    if name := match['domain']:
        name = name.decode(errors='backslashreplace')
    else:
        name = ''

    data['name'] = name

    if levelname := match['levelname']:
        levelname = levelname.decode()
        data['levelname'] = levelname

    levelno = logging.getLevelName(levelname)
    if isinstance(levelno, int):
        data['levelno'] = levelno
    else:
        data['levelno'] = logging.INFO

    if msecs := match['msecs']:
        msecs = int(msecs)
    else:
        msecs = 0

    data['msecs'] = msecs

    if created := match['created']:
        createdtime = datetime.datetime.combine(
            datetime.date.today(),
            datetime.time.fromisoformat(created.decode()).replace(microsecond=msecs * 1000),
        )

        data['created'] = createdtime.timestamp()

    if pid := match['pid']:
        pid = int(pid)
    else:
        pid = None

    data['process'] = pid
    data['processName'] = None

    if prgname := match['prgname']:
        prgname = prgname.decode(errors='backslashreplace')
        if prgname != 'process':
            data['processName'] = prgname
            if not data.get('name'):
                data['name'] = prgname

    return data


def process(lines):
    end = 0

    for match in GLIB_MESSAGE_RE.finditer(lines):
        skip = lines[end:match.start()].strip()

        if skip:
            skip = skip.decode(errors='backslashreplace')

            for line in skip.splitlines():
                LOGGER_UNPARSED.warning('%s', line)

        try:
            LOGGER.handle(logging.makeLogRecord(parse(match)))

        except Exception:
            LOGGER.exception('Failed to propagate log record: %r', match[0])

        end = match.end()

    skip = lines[end:].strip()

    if skip:
        skip = skip.decode(errors='backslashreplace')

        for line in skip.splitlines():
            LOGGER_UNPARSED.warning('%s', line)


class LogParser(threading.Thread):
    def __init__(self, input, tee_output=None):
        super().__init__()

        self.input = input
        self.tee = contextlib.nullcontext() if tee_output is None else tee_output

    def run(self):
        with self.tee as tee, self.input:
            LOGGER.debug('Parsing %r...', self.input)

            buffer = []
            poll = select.poll()
            poll.register(self.input, select.POLLIN)

            while chunk := self.input.read(select.PIPE_BUF):
                buffer.append(chunk)

                if tee is not None:
                    tee.write(chunk)
                    tee.flush()

                # Read from O_DIRECT pipe reads only one "packet".
                if poll.poll(0):
                    continue

                # Incomplete line - incomplete message
                if not chunk.endswith(b'\n'):
                    continue

                try:
                    process(b''.join(buffer))
                except Exception:
                    LOGGER.exception('Error when parsing log stream %r', self.input)
                finally:
                    buffer = []

            process(b''.join(buffer))

            LOGGER.debug('Log stream %r ended', self.input)
