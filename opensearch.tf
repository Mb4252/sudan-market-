# OpenSearch Serverless Collection
resource "aws_opensearchserverless_collection" "main" {
  name = "${var.project_name}-${random_string.suffix.result}"
  type = "TIMESERIES"
  
  tags = {
    Name = "${var.project_name}-opensearch"
  }
}

# OpenSearch Serverless Encryption Policy
resource "aws_opensearchserverless_security_policy" "encryption" {
  name        = "${var.project_name}-encryption-policy"
  type        = "encryption"
  description = "Encryption policy for Video Analyzer collection"
  
  policy = jsonencode({
    Rules = [
      {
        ResourceType = "collection"
        Resource = [
          "collection/${aws_opensearchserverless_collection.main.name}"
        ]
      }
    ]
    AWSOwnedKey = true
  })
}

# OpenSearch Serverless Network Policy
resource "aws_opensearchserverless_security_policy" "network" {
  name        = "${var.project_name}-network-policy"
  type        = "network"
  description = "Network access policy for Video Analyzer"
  
  policy = jsonencode([
    {
      Rules = [
        {
          ResourceType = "collection"
          Resource = [
            "collection/${aws_opensearchserverless_collection.main.name}"
          ]
        },
        {
          ResourceType = "dashboard"
          Resource = [
            "collection/${aws_opensearchserverless_collection.main.name}"
          ]
        }
      ]
      AllowFromPublic = true
    }
  ])
}

# OpenSearch Serverless Data Access Policy
resource "aws_opensearchserverless_access_policy" "data_access" {
  name        = "${var.project_name}-data-access-policy"
  type        = "data"
  description = "Data access policy for Lambda and developers"
  
  policy = jsonencode([
    {
      Rules = [
        {
          ResourceType = "index"
          Resource = [
            "index/${aws_opensearchserverless_collection.main.name}/*"
          ]
          Permission = [
            "aoss:CreateIndex",
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:WriteDocument",
            "aoss:ReadDocument"
          ]
        },
        {
          ResourceType = "collection"
          Resource = [
            "collection/${aws_opensearchserverless_collection.main.name}"
          ]
          Permission = [
            "aoss:CreateCollectionItems",
            "aoss:UpdateCollectionItems",
            "aoss:DescribeCollectionItems"
          ]
        }
      ]
      Principal = [
        aws_iam_role.lambda_execution.arn,
        aws_iam_role.opensearch_access.arn
      ]
    }
  ])
}
