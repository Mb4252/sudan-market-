# Intelligent Serverless Video Anomaly Detector

A fully serverless, cost-optimized, and secured video analysis system built on AWS.  
This project is part of the **AWS Prompt the Planet Challenge** and follows the **AWS Well-Architected Framework**.

## Prerequisites
To deploy this solution, the developer needs:
- An active **AWS Account** with permissions to create resources (IAM, Lambda, S3, Rekognition, DynamoDB, OpenSearch Serverless, WAF, KMS, CloudWatch, X-Ray).
- **Terraform** >= 1.0 installed locally or access to AWS CloudShell.
- **AWS CLI** configured with appropriate credentials.
- An **S3 bucket** for Terraform state (optional; can be local).
- **Docker** (optional, only if modifying Lambda code with native libraries).
- The Amazon Rekognition service must be enabled in the chosen region.

## Use Case
**Why is this solution important and innovative?**  
This system solves the "needle in a haystack" problem in video surveillance. Instead of relying on human monitoring or expensive server-based systems (running 24/7 EC2 instances), this solution processes short video clips uploaded from a mobile app or IoT camera to instantly detect:
- Unfamiliar objects in sensitive environments (e.g., a dangerous animal on a farm, or a person in a restricted area after hours).
- Inappropriate or violent content in user-generated videos (via `DetectModerationLabels`).
- Post-event analysis in retail stores (e.g., "did the customer leave the bag?").

**Innovation:** The strict application of an event-driven serverless model ensures **zero idle cost** – you pay nothing when no videos are uploaded – while the integrated **WAF** protects the endpoint from malicious uploads that could drain the analysis budget.

## Expected Outcome
After deploying this infrastructure with `terraform apply`, you will have:
- A **secure S3 bucket** that only accepts encrypted uploads over HTTPS.
- An **AWS Lambda function** triggered by new video uploads, which calls Amazon Rekognition, stores results in DynamoDB, and indexes metadata into OpenSearch Serverless.
- A **CloudWatch Dashboard** displaying real-time Lambda invocations, errors, Rekognition API calls, and DynamoDB capacity.
- **WAF protection** against large payloads, IP reputation threats, and rate-based attacks.
- A **pre-signed URL** mechanism for secure, temporary video access.

## Troubleshooting
Here are the three most common technical issues and their solutions:

### 1. Lambda times out when processing large videos
- **Problem:** The default Lambda timeout (60s) may be exceeded for videos >50MB due to Rekognition API latency.
- **Solution:** Increase `lambda_timeout` to 120s and `lambda_memory` to 2048 MB (more CPU). For very large files, consider using Elastic Transcoder to split the video before analysis.

### 2. OpenSearch Serverless returns 403 Access Denied
- **Problem:** The Lambda function cannot write to OpenSearch despite having IAM permissions.
- **Solution:** OpenSearch Serverless requires an additional **data access policy** (already defined in `opensearch.tf`). Verify that the policy includes the Lambda's IAM role ARN. In the OpenSearch console, check "Data access" under the collection.

### 3. WAF blocks legitimate uploads
- **Problem:** Users receive 403 errors when uploading valid videos.
- **Solution:** Inspect the WAF logs in CloudWatch (`aws-waf-logs-*`). If the rate-based rule is too aggressive, increase the `limit` in `waf.tf` from 2000 to 5000. Alternatively, add trusted IPs to an IP set and create an allow rule.
