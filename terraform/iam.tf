# Lambda Execution Role
resource "aws_iam_role" "lambda_role" {
  name = "sudan-market-lambda-${random_string.suffix.result}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "sudan-market-lambda-role"
  }
}

# IAM Policy - Strict Least Privilege
resource "aws_iam_policy" "lambda_policy" {
  name        = "sudan-market-policy-${random_string.suffix.result}"
  description = "Custom policy for Sudan Market Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3GetObject"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = ["${aws_s3_bucket.video_uploads.arn}/*"]
      },
      {
        Sid    = "RekognitionAnalyze"
        Effect = "Allow"
        Action = [
          "rekognition:DetectLabels",
          "rekognition:DetectModerationLabels",
          "rekognition:DetectFaces",
          "rekognition:DetectText",
          "rekognition:RecognizeCelebrities"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBWrite"
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = [
          aws_dynamodb_table.results.arn,
          "${aws_dynamodb_table.results.arn}/index/*"
        ]
      },
      {
        Sid    = "OpenSearchWrite"
        Effect = "Allow"
        Action = ["aoss:APIAccessAll"]
        Resource = [aws_opensearchserverless_collection.main.arn]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/*"
        ]
      },
      {
        Sid    = "XRayTrace"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        Resource = "*"
      },
      {
        Sid    = "KMSDecrypt"
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.main.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}
