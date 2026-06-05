# WAFv2 Web ACL
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-waf-${random_string.suffix.result}"
  description = "WAF rules for Video Analyzer"
  scope       = "CLOUDFRONT"
  
  default_action {
    allow {}
  }
  
  # Rule 1: Block requests with body size > 100MB
  rule {
    name     = "BlockLargeBodySize"
    priority = 1
    
    override_action {
      none {}
    }
    
    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = var.max_video_size_mb * 1024 * 1024  # Convert MB to bytes
        
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
  
  # Rule 2: AWS Managed Rule - IP Reputation
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
  
  # Rule 3: AWS Managed Rule - Common Threats
  rule {
    name     = "AWSManagedCommonRuleSet"
    priority = 3
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
        
        excluded_rule {
          name = "SizeRestrictions_QUERYSTRING"
        }
        excluded_rule {
          name = "SizeRestrictions_BODY"
        }
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }
  
  # Rule 4: Rate-based rule for DDoS protection
  rule {
    name     = "RateLimit"
    priority = 4
    
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
    metric_name                = "${var.project_name}-waf-metrics"
    sampled_requests_enabled   = true
  }
  
  tags = {
    Name = "${var.project_name}-waf"
  }
}

# WAFv2 Logging (optional but recommended)
resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "aws-waf-logs-${var.project_name}-${random_string.suffix.result}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn
}
