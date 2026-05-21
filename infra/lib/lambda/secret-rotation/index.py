"""Secrets Manager rotation for opaque, app-generated secrets.

These secrets (JWT signing keys, internal API secret) are random strings with
no external system to update — rotation simply regenerates the value. Implements
the standard four-step Secrets Manager rotation protocol:

  createSecret  -> generate a new random string, store as AWSPENDING
  setSecret     -> no-op (nothing external to update)
  testSecret    -> no-op (an opaque secret has nothing to validate)
  finishSecret  -> promote AWSPENDING to AWSCURRENT

The new value only reaches the API/Lambda after their next restart, since they
read secrets into env vars at startup. See infra/RESTORE_RUNBOOK.md.
"""

import logging
import secrets
import string

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_ALPHABET = string.ascii_letters + string.digits


def handler(event: dict, context: object) -> None:
    arn = event["SecretId"]
    token = event["ClientRequestToken"]
    step = event["Step"]

    client = boto3.client("secretsmanager")
    metadata = client.describe_secret(SecretId=arn)

    if not metadata.get("RotationEnabled"):
        raise ValueError(f"Secret {arn} is not enabled for rotation")

    versions = metadata["VersionIdsToStages"]
    if token not in versions:
        raise ValueError(f"Version {token} has no stage for secret {arn}")
    if "AWSCURRENT" in versions[token]:
        logger.info("Version %s already AWSCURRENT for %s", token, arn)
        return
    if "AWSPENDING" not in versions[token]:
        raise ValueError(f"Version {token} not AWSPENDING for secret {arn}")

    if step == "createSecret":
        _create_secret(client, arn, token)
    elif step in ("setSecret", "testSecret"):
        logger.info("Step %s is a no-op for opaque secret %s", step, arn)
    elif step == "finishSecret":
        _finish_secret(client, arn, token, metadata)
    else:
        raise ValueError(f"Unknown rotation step: {step}")


def _create_secret(client, arn: str, token: str) -> None:
    """Generate the AWSPENDING value, matching the current value's length."""
    try:
        client.get_secret_value(SecretId=arn, VersionId=token, VersionStage="AWSPENDING")
        logger.info("AWSPENDING already exists for %s", arn)
        return
    except client.exceptions.ResourceNotFoundException:
        pass

    current = client.get_secret_value(SecretId=arn, VersionStage="AWSCURRENT")["SecretString"]
    length = len(current) if current else 64
    new_value = "".join(secrets.choice(_ALPHABET) for _ in range(length))
    client.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        SecretString=new_value,
        VersionStages=["AWSPENDING"],
    )
    logger.info("Stored new AWSPENDING value for %s", arn)


def _finish_secret(client, arn: str, token: str, metadata: dict) -> None:
    """Promote AWSPENDING to AWSCURRENT."""
    current_version = next(
        (v for v, stages in metadata["VersionIdsToStages"].items() if "AWSCURRENT" in stages),
        None,
    )
    if current_version == token:
        logger.info("Version %s already AWSCURRENT for %s", token, arn)
        return

    client.update_secret_version_stage(
        SecretId=arn,
        VersionStage="AWSCURRENT",
        MoveToVersionId=token,
        RemoveFromVersionId=current_version,
    )
    logger.info("Promoted version %s to AWSCURRENT for %s", token, arn)
