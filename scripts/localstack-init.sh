#!/bin/bash
# LocalStack initialization script — runs after LocalStack is ready
# Creates the S3 buckets and SQS queues needed for local development

set -e

echo "Initializing LocalStack resources..."

AWS_CMD="aws --endpoint-url=http://localhost:4566 --region us-east-1"

# S3 buckets
$AWS_CMD s3 mb s3://afterlight-uploads
$AWS_CMD s3 mb s3://afterlight-generated-docs

# Enable versioning on uploads bucket
$AWS_CMD s3api put-bucket-versioning \
  --bucket afterlight-uploads \
  --versioning-configuration Status=Enabled

# SQS queues
$AWS_CMD sqs create-queue --queue-name afterlight-document-processing
$AWS_CMD sqs create-queue --queue-name afterlight-document-processing-dlq

echo "LocalStack resources initialized."
