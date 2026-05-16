#!/bin/bash
# LocalStack initialization script — runs after LocalStack is ready
# Creates the S3 buckets and SQS queues needed for local development

set -e

echo "Initializing LocalStack resources..."

AWS_CMD="aws --endpoint-url=http://localhost:4566 --region us-east-1"

# S3 buckets
$AWS_CMD s3 mb s3://tarpan-uploads
$AWS_CMD s3 mb s3://tarpan-generated-docs

# Enable versioning on uploads bucket
$AWS_CMD s3api put-bucket-versioning \
  --bucket tarpan-uploads \
  --versioning-configuration Status=Enabled

# CORS for uploads bucket — allows the React dev server (localhost:5173) to PUT
# directly to pre-signed URLs from the browser
$AWS_CMD s3api put-bucket-cors \
  --bucket tarpan-uploads \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedOrigins": ["http://localhost:5173", "http://localhost:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }]
  }'

# SQS queues
$AWS_CMD sqs create-queue --queue-name tarpan-document-processing
$AWS_CMD sqs create-queue --queue-name tarpan-document-processing-dlq
$AWS_CMD sqs create-queue --queue-name tarpan-document-generation
$AWS_CMD sqs create-queue --queue-name tarpan-document-generation-dlq

echo "LocalStack resources initialized."
