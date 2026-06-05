output "s3_bucket_name" {
  description = "Name of the S3 bucket for video uploads"
  value       = aws_s3_bucket.video_uploads.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.video_uploads.arn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.video.domain_name
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.video_processor.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.video_processor.arn
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for results"
  value       = aws_dynamodb_table.analysis_results.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.analysis_results.arn
}

output "opensearch_collection_endpoint" {
  description = "OpenSearch Serverless collection endpoint"
  value       = aws_opensearchserverless_collection.main.collection_endpoint
}

output "opensearch_collection_arn" {
  description = "OpenSearch Serverless collection ARN"
  value       = aws_opensearchserverless_collection.main.arn
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.main.arn
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = aws_kms_key.main.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "dlq_url" {
  description = "Dead letter queue URL"
  value       = aws_sqs_queue.dlq.url
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "deployment_instructions" {
  description = "Instructions for using this deployment"
  value = <<-EOT
    1. Update terraform.tfvars with your specific values
    2. Run: terraform init
    3. Run: terraform plan -out=tfplan
    4. Run: terraform apply tfplan
    5. Upload videos to: s3://${aws_s3_bucket.video_uploads.id}/uploads/
    6. Monitor via: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}
  EOT
}
