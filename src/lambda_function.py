"""
Sudan Market - Intelligent Video Anomaly Detector
AWS Lambda function for video analysis using Amazon Rekognition
Part of AWS Prompt the Planet Challenge 2026
"""

import json
import os
import uuid
import boto3
from datetime import datetime, timedelta
from decimal import Decimal

# AWS Clients
s3_client = boto3.client('s3')
rekognition = boto3.client('rekognition')
dynamodb = boto3.resource('dynamodb')

# Environment variables
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT', '')
MAX_VIDEO_SIZE_MB = int(os.environ.get('MAX_VIDEO_SIZE_MB', 100))

# Initialize DynamoDB table
table = dynamodb.Table(DYNAMODB_TABLE)


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder for DynamoDB Decimal types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def analyze_with_rekognition(bucket: str, key: str) -> dict:
    """
    Analyze video/image using Amazon Rekognition
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
    
    Returns:
        Dictionary containing analysis results
    """
    print(f"[INFO] Starting Rekognition analysis for s3://{bucket}/{key}")
    
    try:
        # Detect labels in the image/video
        labels_response = rekognition.detect_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            MaxLabels=50,
            MinConfidence=70.0
        )
        
        # Detect moderation labels (inappropriate content)
        moderation_response = rekognition.detect_moderation_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            MinConfidence=60.0
        )
        
        # Process detected labels
        labels = []
        for label in labels_response.get('Labels', []):
            labels.append({
                'name': label['Name'],
                'confidence': label['Confidence'],
                'categories': [c['Name'] for c in label.get('Categories', [])]
            })
        
        # Process moderation labels
        moderation_labels = []
        for label in moderation_response.get('ModerationLabels', []):
            moderation_labels.append({
                'name': label['Name'],
                'confidence': label['Confidence'],
                'parent_name': label.get('ParentName', '')
            })
        
        # Check for anomalies
        has_anomalies = len(moderation_labels) > 0
        
        result = {
            'labels': labels,
            'moderation_labels': moderation_labels,
            'has_anomalies': has_anomalies,
            'label_count': len(labels),
            'moderation_count': len(moderation_labels),
            'analysis_timestamp': datetime.utcnow().isoformat()
        }
        
        print(f"[SUCCESS] Analysis complete: {len(labels)} labels, {len(moderation_labels)} moderation flags")
        return result
        
    except Exception as e:
        print(f"[ERROR] Rekognition analysis failed: {str(e)}")
        raise


def store_results(video_id: str, bucket: str, key: str, analysis: dict) -> None:
    """
    Store analysis results in DynamoDB
    
    Args:
        video_id: Unique video identifier
        bucket: S3 bucket name
        key: S3 object key
        analysis: Analysis results from Rekognition
    """
    print(f"[INFO] Storing results for video: {video_id}")
    
    timestamp = datetime.utcnow().isoformat()
    ttl = int((datetime.utcnow() + timedelta(days=30)).timestamp())
    
    item = {
        'video_id': video_id,
        'timestamp': timestamp,
        's3_bucket': bucket,
        's3_key': key,
        'has_anomalies': analysis['has_anomalies'],
        'label_count': analysis['label_count'],
        'moderation_count': analysis['moderation_count'],
        'labels': analysis['labels'],
        'moderation_labels': analysis['moderation_labels'],
        'status': 'COMPLETED',
        'ttl': ttl
    }
    
    try:
        table.put_item(Item=item)
        print(f"[SUCCESS] Results stored for video: {video_id}")
    except Exception as e:
        print(f"[ERROR] Failed to store results: {str(e)}")
        raise


def generate_presigned_url(bucket: str, key: str, expiration: int = 3600) -> str:
    """
    Generate pre-signed URL for secure video access
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
        expiration: URL expiration in seconds
    
    Returns:
        Pre-signed URL string
    """
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiration
        )
        print(f"[INFO] Generated pre-signed URL (expires in {expiration}s)")
        return url
    except Exception as e:
        print(f"[ERROR] Failed to generate pre-signed URL: {str(e)}")
        raise


def lambda_handler(event: dict, context) -> dict:
    """
    Main Lambda handler triggered by S3 video upload
    
    Args:
        event: S3 event notification
        context: Lambda context object
    
    Returns:
        Response dictionary with processing status
    """
    print(f"[EVENT] Processing video upload")
    print(f"[EVENT] Event: {json.dumps(event, cls=DecimalEncoder)}")
    
    try:
        # Validate event structure
        if 'Records' not in event:
            raise ValueError("Event does not contain Records")
        
        # Extract S3 event details
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        video_size = record['s3']['object'].get('size', 0)
        
        # Validate video size
        if video_size > MAX_VIDEO_SIZE_MB * 1024 * 1024:
            raise ValueError(f"Video size ({video_size} bytes) exceeds maximum ({MAX_VIDEO_SIZE_MB}MB)")
        
        # Generate unique video ID
        video_id = str(uuid.uuid4())
        
        print(f"[INFO] Processing video: {video_id}")
        print(f"[INFO] Source: s3://{bucket}/{key}")
        print(f"[INFO] Size: {video_size} bytes")
        
        # Store initial processing status
        table.put_item(Item={
            'video_id': video_id,
            'timestamp': datetime.utcnow().isoformat(),
            's3_bucket': bucket,
            's3_key': key,
            'status': 'PROCESSING',
            'ttl': int((datetime.utcnow() + timedelta(days=30)).timestamp())
        })
        
        # Analyze video with Amazon Rekognition
        analysis = analyze_with_rekognition(bucket, key)
        
        # Store final results in DynamoDB
        store_results(video_id, bucket, key, analysis)
        
        # Generate pre-signed URL for secure access
        presigned_url = generate_presigned_url(bucket, key)
        
        # Prepare success response
        response_body = {
            'video_id': video_id,
            'status': 'COMPLETED',
            'has_anomalies': analysis['has_anomalies'],
            'presigned_url': presigned_url,
            'labels_detected': analysis['label_count'],
            'moderation_flags': analysis['moderation_count'],
            'message': 'Video analysis completed successfully!'
        }
        
        print(f"[SUCCESS] Processing complete for video: {video_id}")
        print(f"[RESULT] {json.dumps(response_body, cls=DecimalEncoder)}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps(response_body, cls=DecimalEncoder)
        }
        
    except Exception as e:
        error_msg = f"Video processing failed: {str(e)}"
        print(f"[ERROR] {error_msg}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'error': 'Video processing failed',
                'details': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
        }
