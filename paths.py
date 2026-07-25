"""Writable runtime paths for FilesToAI."""

import os
from pathlib import Path


def get_app_data_dir() -> Path:
    override = os.environ.get("FILESTOAI_DATA_DIR")
    if override:
        app_data_dir = Path(override).expanduser()
    elif os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        app_data_dir = (
            Path(local_app_data) / "FilesToAI"
            if local_app_data
            else Path.home() / "AppData" / "Local" / "FilesToAI"
        )
    else:
        app_data_dir = (
            Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
            / "filestoai"
        )

    app_data_dir.mkdir(parents=True, exist_ok=True)
    return app_data_dir


APP_DATA_DIR = get_app_data_dir()
CONFIG_FILE_PATH = APP_DATA_DIR / "config.json"
LOG_FILE_PATH = APP_DATA_DIR / "global_hotkey_listener.log"
