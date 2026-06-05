terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.31.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4.0"
    }
  }
  
  backend "s3" {
    # Configure for production use
    bucket = "terraform-state-bucket-name"
    key    = "video-analyzer/terraform.tfstate"
    region = "us-east-1"
    
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "IntelligentVideoAnalyzer"
      Environment = var.environment
      ManagedBy   = "Terraform"
      CostCenter  = "innovation-lab"
      Owner       = "devops-team"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Random suffix for unique resource naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# KMS key for encryption
resource "aws_kms_key" "main" {
  description             = "KMS key for Video Analyzer encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${data.aws_region.current.name}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = {
    Name = "video-analyzer-key-${random_string.suffix.result}"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/video-analyzer-${random_string.suffix.result}"
  target_key_id = aws_kms_key.main.key_id
}
