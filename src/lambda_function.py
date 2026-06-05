"""
Intelligent Video Anomaly Detector - Lambda Function
AWS Lambda handler for processing uploaded videos with Rekognition
"""

import json
import os
import time
import uuid
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any, List

# AWS Powertools for observability
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

# Initialize Powertools
logger = Logger()
metrics = Metrics()
tracer = Tracer()

# AWS Clients
s3_client = boto3.client('s3')
rekognition_client = boto3.client('rekognition')
dynamodb = boto3.resource('dynamodb')

# Environment variables
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
OPENSEARCH_ENDPOINT = os.environ['OPENSEARCH_ENDPOINT']
OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX', 'video-analysis')
MAX_VIDEO_SIZE_MB = int(os.environ.get('MAX_VIDEO_SIZE_MB', 100))

# Initialize DynamoDB table
table = dynamodb.Table(DYNAMODB_TABLE)

class VideoProcessingError(Exception):
    """Custom exception for video processing errors"""
    pass

@tracer.capture_method
def analyze_video_with_rekognition(bucket: str, key: str) -> Dict[str, Any]:
    """
    Analyze video using Amazon Rekognition
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
    
    Returns:
        Dictionary containing analysis results
    """
    logger.info(f"Starting Rekognition analysis for s3://{bucket}/{key}")
    
    try:
        # Start label detection
        labels_response = rekognition_client.detect_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            MaxLabels=50,
            MinConfidence=70.0
        )
        
        # Start moderation label detection
        moderation_response = rekognition_client.detect_moderation_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            MinConfidence=60.0
        )
        
        # Process labels
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
        
        # Detect anomalies based on moderation content
        has_anomalies = len(moderation_labels) > 0
        
        result = {
            'labels': labels,
            'moderation_labels': moderation_labels,
            'has_anomalies': has_anomalies,
            'label_count': len(labels),
            'moderation_label_count': len(moderation_labels),
            'analysis_timestamp': datetime.utcnow().isoformat()
        }
        
        metrics.add_metric(name='LabelsDetected', unit=MetricUnit.Count, value=len(labels))
        metrics.add_metric(name='ModerationLabelsDetected', unit=MetricUnit.Count, value=len(moderation_labels))
        
        return result
        
    except Exception as e:
        logger.exception(f"Rekognition analysis failed: {str(e)}")
        raise VideoProcessingError(f"Rekognition analysis failed: {str(e)}")

@tracer.capture_method
def store_results(video_id: str, bucket: str, key: str, analysis: Dict[str, Any]) -> None:
    """
    Store analysis results in DynamoDB
    
    Args:
        video_id: Unique video identifier
        bucket: S3 bucket name
        key: S3 object key
        analysis: Analysis results from Rekognition
    """
    logger.info(f"Storing results for video {video_id}")
    
    timestamp = datetime.utcnow().isoformat()
    ttl = int((datetime.utcnow() + timedelta(days=30)).timestamp())
    
    item = {
        'video_id': video_id,
        'timestamp': timestamp,
        's3_bucket': bucket,
        's3_key': key,
        'has_anomalies': analysis['has_anomalies'],
        'label_count': analysis['label_count'],
        'moderation_label_count': analysis['moderation_label_count'],
        'labels': analysis['labels'],
        'moderation_labels': analysis['moderation_labels'],
        'status': 'COMPLETED',
        'ttl': ttl
    }
    
    try:
        table.put_item(Item=item)
        metrics.add_metric(name='ResultsStored', unit=MetricUnit.Count, value=1)
        logger.info(f"Successfully stored results for video {video_id}")
        
    except Exception as e:
        logger.exception(f"Failed to store results: {str(e)}")
        raise VideoProcessingError(f"DynamoDB storage failed: {str(e)}")

@tracer.capture_method
def generate_presigned_url(bucket: str, key: str, expiration: int = 3600) -> str:
    """
    Generate pre-signed URL for video access
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
        expiration: URL expiration time in seconds
    
    Returns:
        Pre-signed URL string
    """
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiration
        )
        logger.info("Generated pre-signed URL successfully")
        return url
        
    except Exception as e:
        logger.exception(f"Failed to generate pre-signed URL: {str(e)}")
        raise VideoProcessingError(f"Pre-signed URL generation failed: {str(e)}")

@logger.inject_lambda_context
@metrics.log_metrics
@tracer.capture_lambda_handler
def lambda_handler(event: Dict[str, Any], context: LambdaContext) -> Dict[str, Any]:
    """
    Main Lambda handler for S3 video upload events
    
    Args:
        event: S3 event notification
        context: Lambda context
    
    Returns:
        Response dictionary with processing status
    """
    logger.info(f"Processing video upload event")
    metrics.add_metric(name='VideoUploads', unit=MetricUnit.Count, value=1)
    
    try:
        # Extract S3 event details
        if 'Records' not in event:
            raise ValueError("Event does not contain Records")
        
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        video_size = record['s3']['object']['size']
        
        # Validate video size
        if video_size > MAX_VIDEO_SIZE_MB * 1024 * 1024:
            raise ValueError(f"Video size {video_size} exceeds maximum {MAX_VIDEO_SIZE_MB}MB")
        
        # Generate unique video ID
        video_id = str(uuid.uuid4())
        
        logger.info(f"Processing video: {video_id} from bucket: {bucket}, key: {key}")
        
        # Store initial processing status
        table.put_item(Item={
            'video_id': video_id,
            'timestamp': datetime.utcnow().isoformat(),
            's3_bucket': bucket,
            's3_key': key,
            'status': 'PROCESSING',
            'ttl': int((datetime.utcnow() + timedelta(days=30)).timestamp())
        })
        
        # Analyze video with Rekognition
        analysis_results = analyze_video_with_rekognition(bucket, key)
        
        # Store analysis results
        store_results(video_id, bucket, key, analysis_results)
        
        # Generate pre-signed URL
        presigned_url = generate_presigned_url(bucket, key)
        
        response = {
            'statusCode': 200,
            'body': json.dumps({
                'video_id': video_id,
                'status': 'COMPLETED',
                'has_anomalies': analysis_results['has_anomalies'],
                'presigned_url': presigned_url,
                'message': 'Video analysis completed successfully'
            })
        }
        
        logger.info(f"Successfully processed video {video_id}")
        metrics.add_metric(name='SuccessfulProcessings', unit=MetricUnit.Count, value=1)
        
        return response
        
    except VideoProcessingError as e:
        logger.error(f"Video processing error: {str(e)}")
        metrics.add_metric(name='ProcessingErrors', unit=MetricUnit.Count, value=1)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Video processing failed',
                'details': str(e)
            })
        }
        
    except Exception as e:
        logger.exception(f"Unexpected error: {str(e)}")
        metrics.add_metric(name='UnexpectedErrors', unit=MetricUnit.Count, value=1)
        raise
