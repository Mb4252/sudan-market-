# Lambda function source code packaging
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src"
  output_path = "${path.module}/../build/lambda_function.zip"
  
  excludes = [
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    "venv",
    ".git"
  ]
}

# Lambda Function
resource "aws_lambda_function" "video_processor" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.project_name}-processor-${random_string.suffix.result}"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "lambda_function.lambda_handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = "python3.12"
  memory_size     = var.lambda_memory_size
  timeout         = var.lambda_timeout
  architectures   = ["arm64"]  # Graviton for cost optimization
  
  environment {
    variables = {
      DYNAMODB_TABLE        = aws_dynamodb_table.analysis_results.name
      OPENSEARCH_ENDPOINT   = aws_opensearchserverless_collection.main.collection_endpoint
      OPENSEARCH_INDEX      = "video-analysis"
      MAX_VIDEO_SIZE_MB     = var.max_video_size_mb
      LOG_LEVEL             = var.environment == "production" ? "INFO" : "DEBUG"
      ENABLE_XRAY           = var.enable_xray
      POWERTOOLS_SERVICE_NAME = "video-analyzer"
      POWERTOOLS_METRICS_NAMESPACE = "${var.project_name}-metrics"
    }
  }
  
  tracing_config {
    mode = "Active"
  }
  
  reserved_concurrent_executions = var.environment == "production" ? 10 : 5
  
  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }
  
  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda.name
  }
  
  depends_on = [
    aws_iam_role_policy_attachment.lambda_custom,
    aws_cloudwatch_log_group.lambda
  ]
  
  tags = {
    Name = "${var.project_name}-lambda"
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-processor-${random_string.suffix.result}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
  
  tags = {
    Name = "${var.project_name}-lambda-logs"
  }
}

# S3 Event Notification Configuration
resource "aws_s3_bucket_notification" "video_upload" {
  bucket = aws_s3_bucket.video_uploads.id
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.video_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".mp4"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.video_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".mov"
  }
  
  depends_on = [
    aws_lambda_permission.allow_s3_invoke
  ]
}

# Lambda permission for S3 invocation
resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.video_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.video_uploads.arn
}

# Dead Letter Queue for failed processing
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-dlq-${random_string.suffix.result}"
  message_retention_seconds = 1209600  # 14 days
  kms_master_key_id         = aws_kms_key.main.arn
  
  tags = {
    Name = "${var.project_name}-dlq"
  }
}

resource "aws_sqs_queue_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.dlq.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn": aws_lambda_function.video_processor.arn
          }
        }
      }
    ]
  })
}
