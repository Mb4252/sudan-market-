resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/sudan-market-${random_string.suffix.result}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
  tags = {
    Name = "sudan-market-lambda-logs"
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "sudan-market-${random_string.suffix.result}"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.video_processor.function_name, { stat = "Sum" }],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.video_processor.function_name, { stat = "Sum" }],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.video_processor.function_name, { stat = "p99" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.region
          title   = "Lambda Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/WAFV2", "AllowedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Rule", "ALL"],
            ["AWS/WAFV2", "BlockedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Rule", "ALL"]
          ]
          view    = "timeSeries"
          stacked = true
          region  = "us-east-1"
          title   = "WAF Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.results.name],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", aws_dynamodb_table.results.name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = data.aws_region.current.region
          title   = "DynamoDB Metrics"
          period  = 300
        }
      }
    ]
  })
}
