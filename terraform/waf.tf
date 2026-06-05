resource "aws_wafv2_web_acl" "main" {
  name        = "sudan-market-waf-${random_string.suffix.result}"
  description = "WAF rules for Sudan Market Video Analyzer"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "BlockLargeBodySize"
    priority = 1
    override_action {
      none {}
    }
    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = var.max_video_size_mb * 1024 * 1024
        field_to_match {
          body {
            oversize_handling = "CONTINUE"
          }
        }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlockLargeBodySize"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedIPReputation"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedIPReputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimit"
    priority = 3
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "sudan-market-waf-metrics"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "sudan-market-waf"
  }
}
