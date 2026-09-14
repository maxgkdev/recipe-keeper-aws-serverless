output "cloudfront_url" {
  value       = aws_cloudfront_distribution.frontend_cdn.domain_name
  description = "The public URL of the Recipe Keeper application"
}

output "s3_bucket_name" {
  value       = aws_s3_bucket.frontend_bucket.bucket
  description = "The name of the S3 bucket hosting the frontend files"
}

output "api_endpoint" {
  value       = aws_apigatewayv2_stage.api_stage.invoke_url
  description = "The public invoke URL for the HTTP API Gateway"
}