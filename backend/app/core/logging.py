import logging

_logger = None


def get_logger(name: str = "app") -> logging.Logger:
    global _logger
    if _logger is None:
        logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(asctime)s - %(name)s - %(message)s")
        _logger = logging.getLogger(name)
    return logging.getLogger(name)
