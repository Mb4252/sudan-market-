output "s3_bucket_name" {
  description = "Name of the S3 bucket for video uploads"
  value       = aws_s3_bucket.video_uploads.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.video_uploads.arn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aw
