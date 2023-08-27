import contextlib
import logging
import queue
import re


class RegexLogFilter(logging.Filter):
    def __init__(self, pattern, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if not isinstance(pattern, re.Pattern):
            pattern = re.compile(pattern)

        self.pattern = pattern

    def filter(self, record):
        if not super().filter(record):
            return False

        message = record.message if hasattr(record, 'message') else record.getMessage()

        return bool(self.pattern.search(message))


@contextlib.contextmanager
def capture_logs(filter, logger=None, to_queue=None):
    if to_queue is None:
        to_queue = queue.SimpleQueue()

    if logger is None:
        logger = logging.getLogger()

    handler = logging.handlers.QueueHandler(to_queue)
    handler.addFilter(filter)

    logger.addHandler(handler)

    try:
        yield to_queue
    finally:
        logger.removeHandler(handler)
