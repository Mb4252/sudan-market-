output "bucket_name" {
  description = "S3 bucket name for video uploads"
  value       = aws_s3_bucket.video_uploads.id
}

output "lambda_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.video_processor.function_name
}

output "dynamodb_table" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.results.name
}

output "opensearch_endpoint" {
  description = "OpenSearch Serverless endpoint"
  value       = aws_opensearchserverless_collection.main.collection_endpoint
}

output "waf_web_acl" {
  description = "WAF Web ACL name"
  value       = aws_wafv2_web_acl.main.name
}

output "dashboard_name" {
  description = "CloudWatch Dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "test_command" {
  description = "Command to test the system"
  value       = "aws s3 cp test.mp4 s3://${aws_s3_bucket.video_uploads.id}/uploads/ --sse aws:kms --sse-kms-key-id ${aws_kms_key.main.arn}"
}
