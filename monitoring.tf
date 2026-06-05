# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-dashboard-${random_string.suffix.result}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        x    = 0
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.video_processor.function_name],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.video_processor.function_name],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.video_processor.function_name, { stat = "p99" }]
          ]
          view  = "timeSeries"
          stacked = false
          region = data.aws_region.current.name
          title = "Lambda Metrics"
          stat  = "Sum"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/Rekognition", "CallCount", { stat = "Sum" }],
            ["AWS/Rekognition", "ResponseTime", { stat = "Average" }],
            ["AWS/Rekognition", "ServerErrorCount", { stat = "Sum" }]
          ]
          view  = "timeSeries"
          stacked = false
          region = data.aws_region.current.name
          title = "Rekognition API Metrics"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 0
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.dlq.name],
            ["AWS/SQS", "NumberOfMessagesReceived", "QueueName", aws_sqs_queue.dlq.name],
            ["AWS/SQS", "NumberOfMessagesSent", "QueueName", aws_sqs_queue.dlq.name]
          ]
          view  = "timeSeries"
          stacked = false
          region = data.aws_region.current.name
          title = "Dead Letter Queue Metrics"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 12
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/WAFV2", "AllowedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Rule", "ALL"],
            ["AWS/WAFV2", "BlockedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Rule", "ALL"],
            ["AWS/WAFV2", "CountedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Rule", "ALL"]
          ]
          view  = "timeSeries"
          stacked = true
          region = "us-east-1"  # CloudFront metrics are in us-east-1
          title = "WAF Metrics"
          period = 300
        }
      },
      {
        type = "metric"
        x    = 0
        y    = 12
        width = 24
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.analysis_results.name],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", aws_dynamodb_table.analysis_results.name],
            ["AWS/DynamoDB", "ThrottledRequests", "TableName", aws_dynamodb_table.analysis_results.name]
          ]
          view  = "timeSeries"
          stacked = false
          region = data.aws_region.current.name
          title = "DynamoDB Metrics"
          period = 300
        }
      }
    ]
  })
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.project_name}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda function errors exceeded threshold"
  
  dimensions = {
    FunctionName = aws_lambda_function.video_processor.function_name
  }
  
  alarm_actions = []  # Add SNS topic ARN for notifications
  
  tags = {
    Name = "${var.project_name}-lambda-errors-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${var.project_name}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Dead letter queue has accumulated messages"
  
  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }
  
  alarm_actions = []  # Add SNS topic ARN for notifications
}

# SNS Topic for alerts (optional)
resource "aws_sns_topic" "alerts" {
  name              = "${var.project_name}-alerts-${random_string.suffix.result}"
  kms_master_key_id = aws_kms_key.main.arn
  
  tags = {
    Name = "${var.project_name}-alerts-topic"
  }
}
