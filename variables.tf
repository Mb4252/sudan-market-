variable "aws_region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
  
  validation {
    condition     = can(regex("^(us|eu|ap|sa|ca|me|af)-[a-z]+-\\d$", var.aws_region))
    error_message = "Must be a valid AWS region identifier."
  }
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "project_name" {
  description = "Base name for all project resources"
  type        = string
  default     = "video-analyzer"
}

variable "lambda_memory_size" {
  description = "Lambda function memory allocation in MB"
  type        = number
  default     = 1024
  
  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "Lambda memory must be between 128 and 10240 MB."
  }
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 60
  
  validation {
    condition     = var.lambda_timeout >= 1 && var.lambda_timeout <= 900
    error_message = "Lambda timeout must be between 1 and 900 seconds."
  }
}

variable "max_video_size_mb" {
  description = "Maximum video upload size in MB"
  type        = number
  default     = 100
}

variable "opensearch_ocu_indexing" {
  description = "OpenSearch Serverless OCUs for indexing"
  type        = number
  default     = 1
}

variable "opensearch_ocu_search" {
  description = "OpenSearch Serverless OCUs for search"
  type        = number
  default     = 1
}

variable "enable_xray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

variable "allowed_ip_ranges" {
  description = "IP ranges allowed for OpenSearch Dashboard access (optional)"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Restrict in production
  sensitive   = true
}
