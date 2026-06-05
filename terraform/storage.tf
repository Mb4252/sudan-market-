resource "aws_s3_bucket" "video_uploads" {
  bucket        = "sudan-market-${random_string.suffix.result}"
  force_destroy = true
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

resource "aws_s3_bucket_policy" "video_uploads" {
  bucket = aws_s3_bucket.video_uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.video_uploads.arn,
          "${aws_s3_bucket.video_uploads.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyUnencryptedUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.video_uploads.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

resource "aws_dynamodb_table" "results" {
  name         = "sudan-market-results-${random_string.suffix.result}"
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
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.main.arn
  }
  point_in_time_recovery {
    enabled = true
  }
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  tags = {
    Name = "sudan-market-dynamodb"
  }
}
