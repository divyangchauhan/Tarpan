#!/bin/bash
set -a
source .env
set +a
poetry run python run_worker.py
