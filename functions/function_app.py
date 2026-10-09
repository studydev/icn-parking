import logging
import os

import azure.functions as func

app = func.FunctionApp()


def _key() -> str:
    key = os.environ.get("DATA_GO_KR_KEY")
    if not key:
        raise RuntimeError("DATA_GO_KR_KEY is not configured")
    return key


@app.timer_trigger(schedule="0 */5 * * * *", arg_name="timer", run_on_startup=False, use_monitor=True)
def collect(timer: func.TimerRequest) -> None:
    from common.pipeline import run_collect
    from common.store import stores_from_env

    private, web = stores_from_env()
    result = run_collect(private, web, _key())
    logging.info("collect %s", result)
    if not result["ok"]:
        logging.warning("collect failed slot=%s", result["slot"])


@app.timer_trigger(schedule="0 5 * * * *", arg_name="timer", run_on_startup=False, use_monitor=True)
def exog(timer: func.TimerRequest) -> None:
    from common.pipeline import run_exog
    from common.store import stores_from_env

    private, _ = stores_from_env()
    logging.info("exog %s", run_exog(private, _key()))
