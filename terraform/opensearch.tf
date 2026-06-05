resource "aws_opensearchserverless_collection" "main" {
  name = "sudan-market-${random_string.suffix.result}"
  type = "TIMESERIES"
  tags = {
    Name = "sudan-market-opensearch"
  }
}

resource "aws_opensearchserverless_security_policy" "encryption" {
  name        = "sudan-market-encryption"
  type        = "encryption"
  description = "Encryption policy for Sudan Market"
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

resource "aws_opensearchserverless_security_policy" "network" {
  name        = "sudan-market-network"
  type        = "network"
  description = "Network access policy"
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

resource "aws_opensearchserverless_access_policy" "data" {
  name        = "sudan-market-data-access"
  type        = "data"
  description = "Data access policy for Lambda"
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
        aws_iam_role.lambda_role.arn
      ]
    }
  ])
}
