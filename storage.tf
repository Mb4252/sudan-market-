# S3 Bucket for video uploads
resource "aws_s3_bucket" "video_uploads" {
  bucket = "${var.project_name}-uploads-${random_string.suffix.result}"
  
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_versioning" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  
  rule {
    id     = "expire-old-videos"
    status = "Enabled"
    
    expiration {
      days = var.environment == "production" ? 30 : 7
    }
    
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# S3 Bucket Policy - Deny non-SSL and enforce KMS
resource "aws_s3_bucket_policy" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.video_uploads.arn,
          "${aws_s3_bucket.video_uploads.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport": "false"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.video_uploads.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption": "aws:kms"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedObjectUploadsSSEC"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.video_uploads.arn}/*"
        Condition = {
          "Null": {
            "s3:x-amz-server-side-encryption": "true"
          }
        }
      }
    ]
  })
}

# CloudFront distribution for video delivery
resource "aws_cloudfront_origin_access_control" "video" {
  name                              = "${var.project_name}-oac-${random_string.suffix.result}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "video" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Video Analyzer CDN"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"  # US, Canada, Europe
  
  origin {
    domain_name              = aws_s3_bucket.video_uploads.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.video.id
    origin_id                = "S3-${aws_s3_bucket.video_uploads.id}"
  }
  
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.video_uploads.id}"
    
    forwarded_values {
      query_string = true
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy     = "redirect-to-https"
    min_ttl                    = 0
    default_ttl                = 3600
    max_ttl                    = 86400
    compress                   = true
    
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  
  web_acl_id = aws_wafv2_web_acl.main.arn
  
  tags = {
    Name = "${var.project_name}-cdn-${random_string.suffix.result}"
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.project_name}-security-headers-${random_string.suffix.result}"
  
  security_headers_config {
    content_type_options {
      override = true
    }
    
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

# DynamoDB Table for analysis results
resource "aws_dynamodb_table" "analysis_results" {
  name         = "${var.project_name}-results-${random_string.suffix.result}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "video_id"
  range_key    = "timestamp"
  
  attribute {
    name = "video_id"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    range_key       = "timestamp"
    projection_type = "ALL"
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.main.arn
  }
  
  point_in_time_recovery {
    enabled = var.environment == "production"
  }
  
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  
  tags = {
    Name = "${var.project_name}-dynamodb-${random_string.suffix.result}"
  }
}
