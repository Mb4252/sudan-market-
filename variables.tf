variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "max_video_size_mb" {
  type    = number
  default = 100
}

variable "lambda_timeout" {
  type    = number
  default = 60
}

variable "lambda_memory" {
  type    = number
  default = 1024
}

variable "log_retention_days" {
  type    = number
  default = 30
}
