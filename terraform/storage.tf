data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "../src"
  output_path = "../build/lambda.zip"
}

resource "aws_lambda_function" "video_processor" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "sudan-market-${random_string.suffix.result}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_function.lambda_handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "python3.12"
  memory_size      = var.lambda_memory
  timeout          = var.lambda_timeout
  architectures    = ["arm64"]
  environment {
    variables = {
      DYNAMODB_TABLE      = aws_dynamodb_table.results.name
      OPENSEARCH_ENDPOINT = aws_opensearchserverless_collection.main.collection_endpoint
      MAX_VIDEO_SIZE_MB   = var.max_video_size_mb
      LOG_LEVEL           = "INFO"
    }
  }
  tracing_config {
    mode = "Active"
  }
  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,
    aws_iam_role_policy_attachment.lambda_policy
  ]
  tags = {
    Name = "sudan-market-lambda"
  }
}

resource "aws_s3_bucket_notification" "upload_trigger" {
  bucket = aws_s3_bucket.video_uploads.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.video_processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".mp4"
  }
  depends_on = [aws_lambda_permission.s3_invoke]
}

resource "aws_lambda_permission" "s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.video_processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.video_uploads.arn
}
